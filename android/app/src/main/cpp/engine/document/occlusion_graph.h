#pragma once
#include <vector>
#include <unordered_map>
#include <unordered_set>
#include <optional>
#include <algorithm>
#include <functional>
#include "layer.h"

namespace unflatten {

// "A -> B" means A visually occludes B (brief §10). Backed by an adjacency
// list keyed on LayerId hex string (simplest hashable key without a custom
// hasher duplicated across headers).
class OcclusionGraph {
public:
    struct Edge {
        LayerId occluder;
        LayerId occluded;
        float confidence = 1.0f;
    };

    void addEdge(LayerId occluder, LayerId occluded, float confidence) {
        edges_.push_back(Edge{occluder, occluded, confidence});
    }

    const std::vector<Edge>& edges() const { return edges_; }

    void removeLayer(const LayerId& id) {
        edges_.erase(std::remove_if(edges_.begin(), edges_.end(), [&](const Edge& e) {
            return e.occluder == id || e.occluded == id;
        }), edges_.end());
    }

    // Detects a cycle in the occlusion relation via DFS. A cyclic graph
    // means at least two edges contradict each other (§10 "detect cycles").
    bool hasCycle() const {
        std::unordered_map<std::string, std::vector<std::string>> adj;
        std::unordered_set<std::string> nodes;
        for (const auto& e : edges_) {
            std::string a = e.occluder.toHexString();
            std::string b = e.occluded.toHexString();
            adj[a].push_back(b);
            nodes.insert(a);
            nodes.insert(b);
        }
        std::unordered_map<std::string, int> state; // 0=unvisited,1=visiting,2=done
        std::function<bool(const std::string&)> dfs = [&](const std::string& n) -> bool {
            state[n] = 1;
            for (const auto& nb : adj[n]) {
                int s = state.count(nb) ? state[nb] : 0;
                if (s == 1) return true;
                if (s == 0 && dfs(nb)) return true;
            }
            state[n] = 2;
            return false;
        };
        for (const auto& n : nodes) {
            if (!state.count(n) || state[n] == 0) {
                if (dfs(n)) return true;
            }
        }
        return false;
    }

    // Topological ordering (back-to-front draw order): if A occludes B, B
    // must be drawn before A. Returns nullopt if a cycle makes the ordering
    // ill-defined (caller should surface this to QC per §49 "depth cycles").
    std::optional<std::vector<LayerId>> topologicalDrawOrder(const std::vector<LayerId>& allLayers) const {
        if (hasCycle()) return std::nullopt;
        std::unordered_map<std::string, std::vector<std::string>> occludes; // occluder -> [occluded]
        std::unordered_map<std::string, int> indegree;
        std::unordered_map<std::string, LayerId> byHex;
        for (const auto& id : allLayers) {
            byHex[id.toHexString()] = id;
            indegree[id.toHexString()] = 0;
        }
        for (const auto& e : edges_) {
            std::string occluder = e.occluder.toHexString();
            std::string occluded = e.occluded.toHexString();
            // Edge for draw order: occluded must come before occluder.
            occludes[occluded].push_back(occluder);
            indegree[occluder]++;
        }
        std::vector<std::string> queue;
        for (const auto& id : allLayers) {
            if (indegree[id.toHexString()] == 0) queue.push_back(id.toHexString());
        }
        std::vector<LayerId> order;
        size_t qi = 0;
        while (qi < queue.size()) {
            std::string n = queue[qi++];
            order.push_back(byHex[n]);
            for (const auto& m : occludes[n]) {
                if (--indegree[m] == 0) queue.push_back(m);
            }
        }
        if (order.size() != allLayers.size()) return std::nullopt; // residual cycle
        return order;
    }

private:
    std::vector<Edge> edges_;
};

} // namespace unflatten
