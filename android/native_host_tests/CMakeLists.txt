cmake_minimum_required(VERSION 3.16)
project(unflatten_engine_host_tests CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Builds and runs the native engine's unit tests directly on the host
# (Linux) container, WITHOUT the Android NDK -- this is how the engine's
# correctness is actually verified in this build environment, since no
# Android device/emulator is available here (see DECISIONS.md). It compiles
# the exact same engine/**.cpp sources the Android .so is built from
# (excluding jni/jni_bridge.cpp, which needs <jni.h> and Android-only
# symbols); the engine sources have no Android-specific code, only standard
# C++17 + zlib, so this is a faithful test of the same logic that ships in
# the .so, not a reimplementation.

set(ENGINE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../app/src/main/cpp/engine)

set(ENGINE_SOURCES
    ${ENGINE_DIR}/common/types.cpp
    ${ENGINE_DIR}/common/connected_components.cpp
    ${ENGINE_DIR}/document/layer.cpp
    ${ENGINE_DIR}/document/project.cpp
    ${ENGINE_DIR}/io/uf7p_format.cpp
    ${ENGINE_DIR}/io/png_writer.cpp
    ${ENGINE_DIR}/io/psd_writer.cpp
    ${ENGINE_DIR}/fallback/segmentation_fallback.cpp
    ${ENGINE_DIR}/fallback/inpaint_fallback.cpp
    ${ENGINE_DIR}/api.cpp
    ${ENGINE_DIR}/session.cpp
)

set(TEST_SOURCES
    main.cpp
    test_tiled_image.cpp
    test_compositor.cpp
    test_uf7p_format.cpp
    test_png_writer.cpp
    test_psd_writer.cpp
    test_fallback_segmentation.cpp
    test_inpaint_fallback.cpp
    test_api_pipeline.cpp
    test_session_edit_ops.cpp
)

add_executable(unflatten_engine_tests ${ENGINE_SOURCES} ${TEST_SOURCES})
target_include_directories(unflatten_engine_tests PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../app/src/main/cpp)
target_compile_options(unflatten_engine_tests PRIVATE -Wall -Wextra -Wno-unused-parameter -g)

find_library(ZLIB_LIB z)
target_link_libraries(unflatten_engine_tests PRIVATE ${ZLIB_LIB})

enable_testing()
add_test(NAME unflatten_engine_tests COMMAND unflatten_engine_tests)
