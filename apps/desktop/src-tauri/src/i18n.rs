use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    LazyLock,
};
static JAPANESE: AtomicBool = AtomicBool::new(false);
static EN: LazyLock<HashMap<String, String>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../src/locales/native-en.json")).expect("English catalog")
});
static JA: LazyLock<HashMap<String, String>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../src/locales/native-ja.json"))
        .expect("Japanese catalog")
});
pub fn is_japanese() -> bool {
    JAPANESE.load(Ordering::Relaxed)
}
pub fn set(locale: &str) {
    JAPANESE.store(locale == "ja", Ordering::Relaxed);
}
pub fn text(key: &'static str) -> &'static str {
    let catalog = if is_japanese() { &*JA } else { &*EN };
    catalog
        .get(key)
        .or_else(|| EN.get(key))
        .map(String::as_str)
        .unwrap_or(key)
}
#[macro_export]
macro_rules! localized_format {
    ($ko:literal, $en:literal, $ja:literal $(, $arg:expr)* $(,)?) => {
        if $crate::i18n::is_japanese() { format!($ja $(, $arg)*) } else { format!($en $(, $arg)*) }
    };
}
