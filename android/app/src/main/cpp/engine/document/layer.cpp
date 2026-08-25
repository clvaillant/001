#include "layer.h"
#include <sstream>
#include <iomanip>
#include <stdexcept>
#include <random>

namespace unflatten {

LayerId newLayerId() {
    static thread_local std::mt19937_64 rng(std::random_device{}());
    static thread_local std::uniform_int_distribution<uint64_t> dist;
    return LayerId{dist(rng), dist(rng)};
}

std::string LayerId::toHexString() const {
    std::ostringstream oss;
    oss << std::hex << std::setfill('0') << std::setw(16) << hi
        << std::setw(16) << lo;
    return oss.str();
}

LayerId LayerId::fromHexString(const std::string& s) {
    if (s.size() != 32) {
        throw std::invalid_argument("LayerId hex string must be 32 chars");
    }
    LayerId id{};
    id.hi = std::stoull(s.substr(0, 16), nullptr, 16);
    id.lo = std::stoull(s.substr(16, 16), nullptr, 16);
    return id;
}

} // namespace unflatten
