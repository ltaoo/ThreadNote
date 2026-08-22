/**
 * Composable page header. The page owns its surrounding layout and supplies
 * any feature-specific action components through `actions`.
 */
export function HomePageHeader(props = {}) {
  let actions = [];
  if (Array.isArray(props.actions)) actions = props.actions;
  return View(
    {
      as: "header",
      class: "memo-topbar home-page-header",
      attributes: { n: props.meaning || "home-page-header" },
    },
    [
      View(
        {
          class: "memo-topbar-copy",
          attributes: { n: "home-page-header-copy" },
        },
        [
          View(
            {
              class: "memo-topbar-eyebrow",
              attributes: { n: "home-page-header-eyebrow" },
            },
            [props.eyebrow || "THREAD / INBOX"],
          ),
          View(
            { as: "h1", attributes: { n: "home-page-header-title" } },
            [props.title || ""],
          ),
          View(
            { as: "p", attributes: { n: "home-page-header-subtitle" } },
            [props.subtitle || ""],
          ),
        ],
      ),
      View(
        {
          class: "memo-topbar-actions",
          attributes: { n: "home-page-header-actions" },
        },
        actions,
      ),
    ],
  );
}

export function HomePageToast(props = {}) {
  return View(
    {
      class: props.className || "memo-toast",
      attributes: { "data-toast": "true", role: "status" },
    },
    [props.text || ""],
  );
}
