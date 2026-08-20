export function NotFoundPageView(props) {
  return View({ class: "page notfound-page w-full h-full" }, [
    View({ class: "notfound-panel" }, [
      View({ class: "notfound-code" }, [Txt("404")]),
      View({ class: "notfound-eyebrow" }, [Txt("THREAD / LOST")]),
      View({ class: "notfound-title" }, [Txt("这一页没有接在线索上")]),
      View({ class: "notfound-copy" }, [Txt("返回工作台，继续沿着你的记录往前走。")]),
      Button(
        {
          type: "primary",
          onClick() {
            props.history.push("root.home_layout.home");
          },
        },
        [Txt("返回工作台")],
      ),
    ]),
  ]);
}
