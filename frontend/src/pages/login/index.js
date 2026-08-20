export function LoginPageView(props) {
  return View({ class: "page auth-page w-full h-full" }, [
    View({ class: "auth-panel" }, [
      View({ class: "auth-brand" }, [
        View({ class: "auth-brand-mark" }),
        View({ class: "auth-brand-copy" }, [
          View({ class: "auth-eyebrow" }, [Txt("LOCAL / WORKSPACE")]),
          View({ class: "auth-title" }, [Txt("ThreadNote")]),
          View({ class: "auth-subtitle" }, [Txt("登录到你的本地工作台")]),
        ]),
      ]),
      View({ class: "fields" }, [
        View({ class: "field" }, [
          View({ class: "label" }, [Txt("Username")]),
          View({ class: "input" }, [
            Input({ type: "text", placeholder: "Enter your username" }),
          ]),
        ]),
        View({ class: "field" }, [
          View({ class: "label" }, [Txt("Password")]),
          View({ class: "input" }, [
            Input({ type: "password", placeholder: "Enter your password" }),
          ]),
        ]),
      ]),
      View({ class: "auth-actions" }, [
      Button(
        {
          type: "primary",
          onClick() {
            props.history.push("root.home_layout.home");
          },
        },
        [Txt("Login")],
      ),
      ]),
    ]),
  ]);
}
