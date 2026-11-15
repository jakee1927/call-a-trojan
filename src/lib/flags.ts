const on = (v: string | undefined) => v !== "0" && v !== "false";
export const FLAGS = {
  showme: on(process.env.NEXT_PUBLIC_FEATURE_SHOWME),
  call: on(process.env.NEXT_PUBLIC_FEATURE_CALL),
  future: on(process.env.NEXT_PUBLIC_FEATURE_FUTURE),
  orgUsg: on(process.env.NEXT_PUBLIC_FEATURE_ORG_USG),
};
