export function isOpenUiPreview() {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.CREED_OPEN_UI_PREVIEW === "true"
  );
}
