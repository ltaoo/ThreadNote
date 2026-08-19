#ifndef THREADNOTE_EVENT_TOKEN_H
#define THREADNOTE_EVENT_TOKEN_H

// Microsoft.Web.WebView2 includes this Windows SDK header, but MinGW does not
// ship it. Keep the ABI-compatible Windows definition available to the CGO
// compiler used by the release workflow.
typedef struct EventRegistrationToken {
  __int64 value;
} EventRegistrationToken;

#endif
