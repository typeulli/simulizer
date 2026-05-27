// EM wave-packet Blockly → Python export (real output)
export const PYTHON_EXPORT = `import numpy as np
from simstd import *

def main():
    N3 = 500
    Nt = 1000
    Np = 30
    dx3 = 4e-08
    dt = 1e-16
    VC = 299792458
    q = 1.602e-19
    m = 9.11e-31
    MU = 1.257e-06
    per = 2.5e-15

    E1 = np.zeros(500); E2 = np.zeros(500); E3 = np.zeros(500)
    B1 = np.zeros(500); B2 = np.zeros(500); B3 = np.zeros(500)
    B1avg = np.zeros(500); B2avg = np.zeros(500)
    J1 = np.zeros(500); J2 = np.zeros(500); J3 = np.zeros(500)
    x1p = np.zeros(30); x2p = np.zeros(30); x3p = np.zeros(30)
    v1p = np.zeros(30); v2p = np.zeros(30); v3p = np.zeros(30)
    E1p = np.zeros(30); E2p = np.zeros(30); E3p = np.zeros(30)
    B1p = np.zeros(30); B2p = np.zeros(30); B3p = np.zeros(30)

    for i in range(Np):
        x3p[i] = dx3 * (N3 // 2) + i * dx3

    progress = debug_bar(0, Nt)
    se1 = debug_series()
    se2 = debug_series()

    for i in range(Nt):
        debug_bar_set(progress, i)
        t = dt * i
        J1[1] = 4 / (MU * VC * dx3) * (
            np.cos(2 * 3.141592 / per * t)
            * np.exp(-((t - 6*per) ** 2) / (per * per))
        )

        # FDTD: B half-step
        for k in range(N3 - 1):
            B1avg[k] = B1[k]; B2avg[k] = B2[k]
            B1[k] += (E2[k+1] - E2[k]) * dt / dx3
            B2[k] += -(E1[k+1] - E1[k]) * dt / dx3
            B1avg[k] = (B1[k] + B1avg[k]) / 2
            B2avg[k] = (B2[k] + B2avg[k]) / 2

        # Boris pusher: half-accel → rotation → half-accel
        Th = 0.5 * dt * q / m
        for p in range(Np):
            k = int(x3p[p] / dx3)
            x3c = dx3 * k
            E1p[p] = ((x3p[p] - x3c) * E1[k+1] + (x3c + dx3 - x3p[p]) * E1[k]) / dx3
            E2p[p] = ((x3p[p] - x3c) * E2[k+1] + (x3c + dx3 - x3p[p]) * E2[k]) / dx3

            V1 = v1p[p] + Th * E1p[p]
            V2 = v2p[p] + Th * E2p[p]
            V3 = v3p[p] + Th * E3p[p]
            W1 = V1 / Th + V2*B3p[p] - V3*B2p[p]
            W2 = V2 / Th + V3*B1p[p] - V1*B3p[p]
            W3 = V3 / Th + V1*B2p[p] - V2*B1p[p]
            BBGG = B1p[p]**2 + B2p[p]**2 + B3p[p]**2 + 1/(Th*Th)
            W1 = W1 * 2 / BBGG; W2 = W2 * 2 / BBGG; W3 = W3 * 2 / BBGG

            v1p[p] = V1 + W2*B3p[p] - W3*B2p[p] + Th * E1p[p]
            v2p[p] = V2 + W3*B1p[p] - W1*B3p[p] + Th * E2p[p]
            v3p[p] = V3 + W1*B2p[p] - W2*B1p[p] + Th * E3p[p]
            x1p[p] += v1p[p] * dt
            x2p[p] += v2p[p] * dt
            x3p[p] += v3p[p] * dt

        # E full-step
        for k in range(1, N3):
            E1[k] += -(B2[k] - B2[k-1]) * VC * VC * dt / dx3
            E1[k] += -J1[k] * MU * VC * VC * dt
            E2[k] += (B1[k] - B1[k-1]) * VC * VC * dt / dx3

        if i > 63:
            debug_set_holder(se1)
            graph_arr_f64(E1)
            debug_set_holder(se2)
            graph_arr_range_f64(x1p, -1e-19, 1e-19)
`;

// Heat-diffusion 2D — Clang C++ with simstd.hpp
export const CPP_HEAT = `#include "simstd.hpp"

void main() {
    std::vector<i32> S = {100, 100};
    Tensor<f64> Tf = Tensor<f64>({100, 100});
    Tensor<f64> T  = Tensor<f64>({100, 100});

    // Dirac delta seed at the center
    T(50, 50) = 50;
    T(49, 50) = 50; T(51, 50) = 50;
    T(50, 49) = 50; T(50, 51) = 50;
    Tf(50, 50) = 50;

    f64 dx = 0.01;
    f64 alpha = 0.01;
    i32 nt = 1000;
    f64 dt = 0.002;
    f64 lapl = 0;

    i32 p = debug_bar(0, nt);
    debug_set_holder(debug_series());

    for (i32 k = 0; k < nt; k++) {
        debug_bar_set(p, k);

        // 5-point Laplacian, FTCS step
        for (i32 i = 1; i < 98; i++) {
            for (i32 j = 1; j < 98; j++) {
                lapl = (T(i+1, j) + T(i-1, j) + T(i, j+1) + T(i, j-1)
                        - T(i, j) * 4) / (dx * dx);
                Tf(i, j) = T(i, j) + lapl * (dt * alpha);
            }
        }

        // Copy Tf -> T
        for (i32 i = 0; i < 99; i++)
            for (i32 j = 0; j < 99; j++)
                T(i, j) = Tf(i, j);

        show_mat(T);  // ← streams a frame to the result panel
    }
    debug_set_holder(0);
    debug_log(T);
}
`;
