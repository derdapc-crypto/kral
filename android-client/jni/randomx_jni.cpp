/*
 * THE GRID — randomx_jni.cpp (v1.3.7)
 *
 * Thin JNI wrapper that drives a RandomX hash loop on Android arm64-v8a.
 *
 * BUILD NOTE: This file is compiled by the GitHub Actions workflow
 * (.github/workflows/build-librandomx.yml). The output is bundled into the
 * APK at lib/arm64-v8a/librandomx.so. The same library exposes both the
 * RandomX symbols (already provided by tevador/RandomX) AND the JNI hooks
 * declared in RandomXBridge.java.
 *
 * For v1.3.7 we run RandomX in *light mode* with a randomly-generated cache
 * key — the loop computes hashes locally and increments a hashrate counter
 * but does NOT yet submit shares to a pool. Pool/stratum integration is
 * staged for v1.3.8 (each share will be sent over the existing WebSocket
 * to /api/admin/console/ws so the operator can audit per-device contribution
 * end-to-end).
 *
 * Memory: light mode = ~256MB cache shared across VMs. Each thread spawns
 * its own VM (~16MB extra). On a typical 4-8GB Android phone this is fine
 * with threads=1; phones below 3GB should not run mining (safety guard
 * lives in GridWorkerService.java).
 */
#include <jni.h>
#include <string>
#include <thread>
#include <atomic>
#include <vector>
#include <chrono>
#include <random>
#include <mutex>
#include <cstring>

extern "C" {
#include "randomx.h"
}

namespace {

struct State {
    std::atomic<bool>    running{false};
    std::atomic<int>     accepted_shares{0};
    std::atomic<int>     rejected_shares{0};
    std::atomic<double>  hashrate{0.0};
    std::vector<std::thread> workers;
    std::mutex            mtx;
    randomx_cache*        cache{nullptr};
    randomx_dataset*      dataset{nullptr};   // unused in light mode
};

State g;

void worker_loop(int thread_id) {
    randomx_vm* vm = randomx_create_vm(
        (randomx_flags)(RANDOMX_FLAG_DEFAULT),
        g.cache, nullptr);
    if (!vm) return;

    std::mt19937_64 rng(static_cast<uint64_t>(thread_id) * 0x9E3779B97F4A7C15ULL +
                        static_cast<uint64_t>(std::chrono::steady_clock::now().time_since_epoch().count()));
    unsigned char input[76]; // typical Monero block-template size
    unsigned char hash[RANDOMX_HASH_SIZE];

    auto window_start = std::chrono::steady_clock::now();
    uint64_t hashes_in_window = 0;

    while (g.running.load()) {
        for (int i = 0; i < 76; ++i) input[i] = static_cast<unsigned char>(rng() & 0xFF);
        randomx_calculate_hash(vm, input, sizeof(input), hash);
        ++hashes_in_window;

        if ((hashes_in_window & 0x1F) == 0) { // every 32 hashes
            auto now = std::chrono::steady_clock::now();
            double sec = std::chrono::duration<double>(now - window_start).count();
            if (sec >= 5.0) {
                double hps = static_cast<double>(hashes_in_window) / sec;
                // simple EMA across threads — atomic store of latest sample
                double prev = g.hashrate.load();
                g.hashrate.store(prev * 0.5 + hps * 0.5);
                window_start = now;
                hashes_in_window = 0;
            }
        }
    }

    randomx_destroy_vm(vm);
}

bool init_cache_unlocked() {
    if (g.cache) return true;
    randomx_flags flags = randomx_get_flags();
    g.cache = randomx_alloc_cache(flags);
    if (!g.cache) return false;
    // Random key for this run. Real Monero uses the epoch block hash; for
    // local-only hash-loop benchmarking a random 32-byte key is fine.
    unsigned char key[32];
    std::random_device rd;
    for (int i = 0; i < 32; ++i) key[i] = static_cast<unsigned char>(rd() & 0xFF);
    randomx_init_cache(g.cache, key, sizeof(key));
    return true;
}

void destroy_state_unlocked() {
    g.running.store(false);
    for (auto& t : g.workers) {
        if (t.joinable()) t.join();
    }
    g.workers.clear();
    if (g.cache) {
        randomx_release_cache(g.cache);
        g.cache = nullptr;
    }
}

} // anon

extern "C" {

JNIEXPORT jboolean JNICALL
Java_io_thegrid_worker_RandomXBridge_nativeStartMining(
        JNIEnv* env, jclass /*clz*/,
        jstring /*pool*/, jstring /*user*/, jstring /*pass*/, jint threads) {
    std::lock_guard<std::mutex> lk(g.mtx);
    if (g.running.load()) return JNI_TRUE;
    if (!init_cache_unlocked()) return JNI_FALSE;

    int n = std::max(1, std::min<int>(threads, 4));
    g.running.store(true);
    g.workers.clear();
    for (int i = 0; i < n; ++i) {
        g.workers.emplace_back(worker_loop, i);
    }
    return JNI_TRUE;
}

JNIEXPORT void JNICALL
Java_io_thegrid_worker_RandomXBridge_nativeStopMining(JNIEnv*, jclass) {
    std::lock_guard<std::mutex> lk(g.mtx);
    destroy_state_unlocked();
    g.hashrate.store(0.0);
}

JNIEXPORT jdouble JNICALL
Java_io_thegrid_worker_RandomXBridge_nativeGetHashrate(JNIEnv*, jclass) {
    return g.hashrate.load();
}

JNIEXPORT jint JNICALL
Java_io_thegrid_worker_RandomXBridge_nativeGetAcceptedShares(JNIEnv*, jclass) {
    return g.accepted_shares.load();
}

JNIEXPORT jint JNICALL
Java_io_thegrid_worker_RandomXBridge_nativeGetRejectedShares(JNIEnv*, jclass) {
    return g.rejected_shares.load();
}

JNIEXPORT jstring JNICALL
Java_io_thegrid_worker_RandomXBridge_nativeGetMiningStatus(JNIEnv* env, jclass) {
    const char* s = g.running.load() ? "running" : "stopped";
    return env->NewStringUTF(s);
}

} // extern "C"
