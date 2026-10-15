// ============================================================================
// WORKSPACE STUDIO STEP HANDLERS
// ============================================================================

/**
 * Configuration Card for "Fetch Unread Chat Messages" in Workspace Studio.
 * Renders the input fields when you click the step in the Flow Builder.
 */
function onConfigFetchUnread() {
  const excludeSpaceInput = CardService.newTextInput()
    .setFieldName('excludeSpaceName')
    .setTitle('Exclude Space Name or ID (Optional)')
    .setHint('e.g., Unread Messages Brief (so your summary space does not summarize itself)')
    .setValue('Unread Messages Brief')
    .setInputMode(CardService.TextInputMode.PLAIN_TEXT);

  const lookbackInput = CardService.newTextInput()
    .setFieldName('maxLookbackHours')
    .setTitle('Max Lookback Window (Hours)')
    .setHint('Default: 24 (only checks unread messages from the last 24 hours)')
    .setValue('24')
    .setInputMode(CardService.TextInputMode.PLAIN_TEXT);

  const section = CardService.newCardSection()
    .setHeader('Configure Unread Chat Fetcher')
    .addWidget(excludeSpaceInput)
    .addWidget(lookbackInput);

  return CardService.newCardBuilder()
    .addSection(section)
    .build();
}

/**
 * Execution handler for "Fetch Unread Chat Messages" in Workspace Studio.
 * Called when the flow runs; returns the `unreadMessagesText` output variable.
 */
function onExecuteFetchUnread(event) {
  try {
    const inputs = (event && event.workflow && event.workflow.actionInvocation && event.workflow.actionInvocation.inputs) || {};
    const excludeSpaceName = getStringInput_(inputs, 'excludeSpaceName', 'Unread Messages Brief');
    const maxLookbackHours = getIntInput_(inputs, 'maxLookbackHours', 24);

    const { unreadSpacesCount, formattedPromptText } = fetchUnreadChatData(excludeSpaceName, maxLookbackHours);
    console.log('Unread Spaces Count:', unreadSpacesCount);
    console.log('Fetched Unread Data:\n' + formattedPromptText);

    const variableDataMap = {
      unreadMessagesText: AddOnsResponseService.newVariableData().addStringValue(formattedPromptText)
    };

    const logText = AddOnsResponseService.newWorkflowTextFormat()
      .addTextFormatElement(
        AddOnsResponseService.newTextFormatElement()
          .setText(`Found ${unreadSpacesCount} unread space(s).`)
      );

    const workflowAction = AddOnsResponseService.newReturnOutputVariablesAction()
      .setVariableDataMap(variableDataMap)
      .setLog(logText);

    return AddOnsResponseService.newRenderActionBuilder()
      .setHostAppAction(AddOnsResponseService.newHostAppAction().setWorkflowAction(workflowAction))
      .build();

  } catch (err) {
    console.error('onExecuteFetchUnread failed: ' + err.stack);
    return buildErrorAction_('Failed to fetch unread chat messages: ' + err.message);
  }
}

// ============================================================================
// CORE GOOGLE CHAT API LOGIC
// ============================================================================

/**
 * Scans the user's Google Chat spaces active within `maxLookbackHours` and returns
 * raw unread message data (top-level messages + replies in new or followed threads).
 */
function fetchUnreadChatData(excludeSpaceName, maxLookbackHours) {
  const lookbackHours = maxLookbackHours || 24;
  const minCutoffDate = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  const minCutoffIso = minCutoffDate.toISOString();
  const sections = [];
  let pageToken = null;

  do {
    const listParams = { pageSize: 100 };
    if (pageToken) listParams.pageToken = pageToken;

    const spacesResponse = Chat.Spaces.list(listParams);
    const spaces = spacesResponse.spaces || [];
    pageToken = spacesResponse.nextPageToken;

    for (const space of spaces) {
      const displayName = space.displayName || 'Direct Message / Group Chat';

      // 1. Skip our own Unread Messages Brief space
      if (excludeSpaceName && (
        displayName.toLowerCase().includes(excludeSpaceName.toLowerCase()) ||
        space.name === excludeSpaceName
      )) {
        continue;
      }

      // 2. Skip spaces with no activity in the lookback window (avoids slow API calls on old spaces)
      if (!space.lastActiveTime || new Date(space.lastActiveTime) < minCutoffDate) {
        continue;
      }

      // 3. Get the user's space-level read state
      let readState;
      try {
        readState = Chat.Users.Spaces.getSpaceReadState(`users/me/${space.name}/spaceReadState`);
      } catch (e) {
        continue;
      }

      if (!readState || !readState.lastReadTime) {
        continue;
      }

      const spaceLastReadMs = new Date(readState.lastReadTime).getTime();
      const lastActiveMs = new Date(space.lastActiveTime).getTime();

      // If space-level lastReadTime is >= lastActiveTime, the space is already read
      if (lastActiveMs <= spaceLastReadMs) {
        continue;
      }

      // 4. Query messages that are BOTH newer than spaceLastReadTime AND within the lookback window
      const effectiveSinceIso = spaceLastReadMs > minCutoffDate.getTime()
        ? readState.lastReadTime
        : minCutoffIso;
      const effectiveSinceMs = new Date(effectiveSinceIso).getTime();

      let candidateMessages = [];
      try {
        const msgResponse = Chat.Spaces.Messages.list(space.name, {
          filter: `createTime > "${effectiveSinceIso}"`,
          pageSize: 40
        });
        candidateMessages = (msgResponse.messages || []).filter(
          m => m.createTime && new Date(m.createTime).getTime() > effectiveSinceMs
        );
      } catch (e) {
        continue;
      }

      if (candidateMessages.length === 0) {
        continue;
      }

      // 5. Identify which threads have a new top-level starter message in this unread batch
      const newTopLevelThreads = new Set();
      for (const m of candidateMessages) {
        if (!m.threadReply && m.thread && m.thread.name) {
          newTopLevelThreads.add(m.thread.name);
        }
      }

      // 6. Filter messages to ONLY top-level messages + replies in followed/new threads
      const threadReadTimeCache = {};
      const formattedMessages = [];

      for (const m of candidateMessages) {
        const msgTimeMs = new Date(m.createTime).getTime();
        const threadResource = m.thread && m.thread.name;

        if (threadResource && !(threadResource in threadReadTimeCache)) {
          try {
            const trs = Chat.Users.Spaces.Threads.getThreadReadState(`users/me/${threadResource}/threadReadState`);
            threadReadTimeCache[threadResource] = (trs && trs.lastReadTime)
              ? new Date(trs.lastReadTime).getTime()
              : null;
          } catch (e) {
            threadReadTimeCache[threadResource] = null;
          }
        }

        const threadLastReadMs = threadResource ? threadReadTimeCache[threadResource] : null;

        // Skip if the user already read this thread at or after this message's timestamp
        if (threadLastReadMs !== null && msgTimeMs <= threadLastReadMs) {
          continue;
        }

        const isTopLevel = !m.threadReply;
        const isReplyToNewUnreadThread = threadResource && newTopLevelThreads.has(threadResource);
        const isFollowedThread = threadLastReadMs !== null && threadLastReadMs > spaceLastReadMs;

        if (isTopLevel || isReplyToNewUnreadThread || isFollowedThread) {
          const cleanText = (m.text || '[Attachment / Card]').replace(/\s+/g, ' ').trim();
          const senderName = m.sender && m.sender.displayName ? m.sender.displayName : null;
          formattedMessages.push(senderName ? `  - ${senderName}: "${cleanText}"` : `  - "${cleanText}"`);
        }
      }

      if (formattedMessages.length === 0) {
        continue;
      }

      const spaceId = space.name.split('/')[1];
      const spaceUrl = `https://chat.google.com/room/${spaceId}`;
      sections.push(
        `Space: ${displayName}\n` +
        `Link: ${spaceUrl}\n` +
        `Messages:\n` +
        formattedMessages.join('\n')
      );
    }
  } while (pageToken);

  if (sections.length === 0) {
    return {
      unreadSpacesCount: 0,
      formattedPromptText: 'NO_UNREAD_MESSAGES: You have 0 unread Google Chat messages.'
    };
  }

  return {
    unreadSpacesCount: sections.length,
    formattedPromptText: sections.join('\n\n')
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getStringInput_(inputs, key, defaultValue) {
  if (inputs[key] && inputs[key].stringValues && inputs[key].stringValues.length > 0) {
    const val = inputs[key].stringValues[0].trim();
    return val !== '' ? val : defaultValue;
  }
  return defaultValue;
}

function getIntInput_(inputs, key, defaultValue) {
  if (inputs[key]) {
    if (inputs[key].integerValues && inputs[key].integerValues.length > 0) {
      return Number(inputs[key].integerValues[0]) || defaultValue;
    }
    if (inputs[key].stringValues && inputs[key].stringValues.length > 0) {
      return parseInt(inputs[key].stringValues[0], 10) || defaultValue;
    }
  }
  return defaultValue;
}

function buildErrorAction_(errorMessage) {
  const workflowAction = AddOnsResponseService.newReturnElementErrorAction()
    .setErrorActionability(AddOnsResponseService.ErrorActionability.ACTIONABLE)
    .setErrorRetryability(AddOnsResponseService.ErrorRetryability.NOT_RETRYABLE)
    .setErrorLog(
      AddOnsResponseService.newWorkflowTextFormat().addTextFormatElement(
        AddOnsResponseService.newTextFormatElement().setText(errorMessage)
      )
    );

  return AddOnsResponseService.newRenderActionBuilder()
    .setHostAppAction(AddOnsResponseService.newHostAppAction().setWorkflowAction(workflowAction))
    .build();
}
