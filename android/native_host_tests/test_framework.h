#pragma once
// Minimal header-only test framework for the native engine's host-side unit
// tests. No external dependency (no GoogleTest) so these tests need nothing
// beyond a host C++17 compiler + zlib -- both already required to build the
// engine itself. Exit code is nonzero iff any check failed, so this plugs
// into `ctest`/`make test`/a CI step exactly like GoogleTest would.
#include <iostream>
#include <string>
#include <vector>
#include <functional>
#include <sstream>
#include <cmath>
#include <cstdlib>

namespace unflatten_test {

struct TestCase {
    std::string name;
    std::function<void()> fn;
};

inline std::vector<TestCase>& registry() {
    static std::vector<TestCase> r;
    return r;
}

struct Registrar {
    Registrar(const std::string& name, std::function<void()> fn) {
        registry().push_back({name, std::move(fn)});
    }
};

inline int g_failures = 0;
inline std::string g_currentTest;

inline void reportFailure(const std::string& expr, const std::string& file, int line) {
    std::cerr << "  [FAIL] " << g_currentTest << " (" << file << ":" << line << "): " << expr << "\n";
    ++g_failures;
}

} // namespace unflatten_test

#define TEST_CASE(name) \
    void name(); \
    static unflatten_test::Registrar registrar_##name(#name, name); \
    void name()

#define CHECK(cond) \
    do { if (!(cond)) unflatten_test::reportFailure(#cond, __FILE__, __LINE__); } while (0)

#define CHECK_EQ(a, b) \
    do { \
        auto _a = (a); auto _b = (b); \
        if (!(_a == _b)) { \
            std::ostringstream _oss; _oss << #a << " == " << #b << " (" << _a << " != " << _b << ")"; \
            unflatten_test::reportFailure(_oss.str(), __FILE__, __LINE__); \
        } \
    } while (0)

#define CHECK_NEAR(a, b, eps) \
    do { \
        auto _a = (a); auto _b = (b); \
        if (std::abs(_a - _b) > (eps)) { \
            std::ostringstream _oss; _oss << #a << " ~= " << #b << " (" << _a << " vs " << _b << ")"; \
            unflatten_test::reportFailure(_oss.str(), __FILE__, __LINE__); \
        } \
    } while (0)

inline int runAllTests() {
    int total = 0;
    for (auto& tc : unflatten_test::registry()) {
        unflatten_test::g_currentTest = tc.name;
        int before = unflatten_test::g_failures;
        try {
            tc.fn();
        } catch (const std::exception& e) {
            unflatten_test::reportFailure(std::string("uncaught exception: ") + e.what(), "?", 0);
        }
        bool passed = unflatten_test::g_failures == before;
        std::cout << (passed ? "[PASS] " : "[FAIL] ") << tc.name << "\n";
        ++total;
    }
    std::cout << "\n" << total << " test cases, " << unflatten_test::g_failures << " assertion failure(s)\n";
    return unflatten_test::g_failures == 0 ? 0 : 1;
}
