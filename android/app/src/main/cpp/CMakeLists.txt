cmake_minimum_required(VERSION 3.22.1)
project(unflatten_engine)

# Explicit source list (not GLOB) so a new .cpp always requires an explicit,
# reviewable change here rather than silently being picked up -- and so a
# stale CMake cache can never silently drop a file either.
set(UNFLATTEN_ENGINE_SOURCES
    engine/common/types.cpp
    engine/common/connected_components.cpp
    engine/document/layer.cpp
    engine/document/project.cpp
    engine/io/uf7p_format.cpp
    engine/io/png_writer.cpp
    engine/io/psd_writer.cpp
    engine/fallback/segmentation_fallback.cpp
    engine/fallback/inpaint_fallback.cpp
    engine/api.cpp
    engine/session.cpp
    jni/jni_bridge.cpp
)

add_library(unflatten_engine SHARED ${UNFLATTEN_ENGINE_SOURCES})

target_include_directories(unflatten_engine PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

find_library(log-lib log)
find_library(z-lib z)

target_link_libraries(unflatten_engine PRIVATE ${log-lib} ${z-lib})

target_compile_options(unflatten_engine PRIVATE -Wall -Wextra -Wno-unused-parameter)
