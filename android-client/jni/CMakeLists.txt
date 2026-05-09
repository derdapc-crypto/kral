# THE GRID — JNI build (v1.3.7)
#
# Bundled into the GitHub Actions librandomx workflow's CMake step (the
# workflow appends `add_subdirectory(${REPO}/android-client/jni)` to
# RandomX's top-level CMakeLists when present, so this builds *into* the
# same librandomx.so as the RandomX symbols).
#
# If you're building locally with NDK installed, point CMAKE_TOOLCHAIN_FILE
# at $ANDROID_NDK_ROOT/build/cmake/android.toolchain.cmake and pass
# -DANDROID_ABI=arm64-v8a.
cmake_minimum_required(VERSION 3.18)

# RandomX provides the `randomx` target (shared lib). We add the JNI shim
# as additional source files into that target so the JNI symbols end up in
# librandomx.so directly — no second .so to manage.
target_sources(randomx PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/randomx_jni.cpp)
target_include_directories(randomx PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../../RandomX/src)
