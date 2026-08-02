// 根据平台选择不同的实现
#[cfg(not(target_os = "android"))]
mod unix_impl;
#[cfg(not(target_os = "android"))]
pub use unix_impl::*;

#[cfg(target_os = "android")]
mod android_impl;
#[cfg(target_os = "android")]
pub use android_impl::*;