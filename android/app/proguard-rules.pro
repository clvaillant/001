# Keep JNI-called native bridge methods and their enclosing classes' fields
# reachable from JNI by name (native code looks them up by signature).
-keepclasseswithmembers class com.unflatten.offline.engine.** {
    native <methods>;
}
-keep class com.unflatten.offline.engine.NativeEngine { *; }
