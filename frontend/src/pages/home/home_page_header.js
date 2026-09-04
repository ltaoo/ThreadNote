export function HomePageHeader() {
  return null;
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
