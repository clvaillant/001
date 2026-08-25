#include "connected_components.h"
#include <algorithm>

namespace unflatten {

std::vector<ConnectedComponent> findConnectedComponents(const std::vector<uint8_t>& binaryMask,
                                                          int32_t w, int32_t h,
                                                          int32_t minAreaPx) {
    std::vector<ConnectedComponent> out;
    if (w <= 0 || h <= 0) return out;

    std::vector<uint8_t> visited(binaryMask.size(), 0);
    std::vector<int32_t> stack;

    for (int32_t sy = 0; sy < h; ++sy) {
        for (int32_t sx = 0; sx < w; ++sx) {
            size_t sidx = static_cast<size_t>(sy) * w + sx;
            if (binaryMask[sidx] == 0 || visited[sidx]) continue;

            int32_t minX = sx, maxX = sx, minY = sy, maxY = sy;
            std::vector<std::pair<int32_t, int32_t>> pixels;
            stack.clear();
            stack.push_back(static_cast<int32_t>(sidx));
            visited[sidx] = 1;
            while (!stack.empty()) {
                int32_t idx = stack.back(); stack.pop_back();
                int32_t x = idx % w, y = idx / w;
                pixels.emplace_back(x, y);
                minX = std::min(minX, x); maxX = std::max(maxX, x);
                minY = std::min(minY, y); maxY = std::max(maxY, y);
                static const int32_t dx[4] = {1, -1, 0, 0};
                static const int32_t dy[4] = {0, 0, 1, -1};
                for (int k = 0; k < 4; ++k) {
                    int32_t nx = x + dx[k], ny = y + dy[k];
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    size_t nidx = static_cast<size_t>(ny) * w + nx;
                    if (binaryMask[nidx] != 0 && !visited[nidx]) {
                        visited[nidx] = 1;
                        stack.push_back(static_cast<int32_t>(nidx));
                    }
                }
            }
            if (static_cast<int32_t>(pixels.size()) < minAreaPx) continue;

            ConnectedComponent comp;
            comp.bounds = Rect{minX, minY, maxX - minX + 1, maxY - minY + 1};
            comp.mask.assign(static_cast<size_t>(comp.bounds.w) * comp.bounds.h, 0);
            for (auto& [x, y] : pixels) {
                comp.mask[static_cast<size_t>(y - minY) * comp.bounds.w + (x - minX)] = 255;
            }
            out.push_back(std::move(comp));
        }
    }
    return out;
}

} // namespace unflatten
