#include <cmath>
#include <cstdint>
#include <emscripten/emscripten.h>

extern "C" {

// Functions injected from JS
double x_fn(double) __attribute__((import_module("env"), import_name("x_fn")));
double y_fn(double) __attribute__((import_module("env"), import_name("y_fn")));

/*
Memory layout (relative to out)

[t_values   (n)]
[x_values   (n)]
[y_values   (n)]
[dl_values  (n-1)]
[tangent_x  (n)]
[tangent_y  (n)]
[normal_x   (n)]
[normal_y   (n)]

Total required size:
(8*n - 1) * 8 bytes

tangent/normal: unit vectors computed via central differences
normal is the left-pointing perpendicular of tangent (-ty, tx)
*/
EMSCRIPTEN_KEEPALIVE int get_2d_boundary(
    double t_min,
    double t_max,
    double dt,
    double* out
) {
    int n = (int)std::floor((t_max - t_min) / dt) + 1;
    if (n <= 0) return 0;

    double* t_values  = out;
    double* x_values  = t_values + n;
    double* y_values  = x_values + n;
    double* dl_values = y_values + n;
    double* tangent_x = dl_values + (n - 1);
    double* tangent_y = tangent_x + n;
    double* normal_x  = tangent_y + n;
    double* normal_y  = normal_x  + n;

    double t = t_min;

    double last_x = x_fn(t);
    double last_y = y_fn(t);

    t_values[0] = t;
    x_values[0] = last_x;
    y_values[0] = last_y;

    for (int i = 1; i < n; ++i) {
        t = t_min + i * dt;

        double xt = x_fn(t);
        double yt = y_fn(t);

        t_values[i] = t;
        x_values[i] = xt;
        y_values[i] = yt;

        double dx = xt - last_x;
        double dy = yt - last_y;

        dl_values[i - 1] = std::sqrt(dx * dx + dy * dy);

        last_x = xt;
        last_y = yt;
    }

    // Compute tangent/normal at each point using central differences
    for (int i = 0; i < n; ++i) {
        double ti = t_min + i * dt;
        double dxt = x_fn(ti + dt * 0.5) - x_fn(ti - dt * 0.5);
        double dyt = y_fn(ti + dt * 0.5) - y_fn(ti - dt * 0.5);
        double len = std::sqrt(dxt * dxt + dyt * dyt);

        if (len < 1e-12) {
            tangent_x[i] = 0.0;
            tangent_y[i] = 0.0;
            normal_x[i]  = 0.0;
            normal_y[i]  = 0.0;
        } else {
            double tx = dxt / len;
            double ty = dyt / len;
            tangent_x[i] = tx;
            tangent_y[i] = ty;
            normal_x[i]  = -ty;  // Left-pointing normal
            normal_y[i]  =  tx;
        }
    }

    return n;
}

}