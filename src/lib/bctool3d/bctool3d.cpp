#include <cmath>
#include <cstdint>
#include <emscripten/emscripten.h>

extern "C" {

// Functions injected from JS (two parameters: u, v)
double x_fn(double, double) __attribute__((import_module("env"), import_name("x_fn")));
double y_fn(double, double) __attribute__((import_module("env"), import_name("y_fn")));
double z_fn(double, double) __attribute__((import_module("env"), import_name("z_fn")));

/*
Memory layout (relative to out)
n = nu * nv, index = i*nv + j

[u_values  (n)]
[v_values  (n)]
[x_values  (n)]
[y_values  (n)]
[z_values  (n)]
[dS_values (n)]   -- area element of each cell (i,j)→(i+1,j+1)
[normal_x  (n)]
[normal_y  (n)]
[normal_z  (n)]

Total required size: 9*n * 8 bytes

dS: magnitude of the cross product of the two edge vectors (parallelogram area)
normal: unit normal vector computed via central differences (∂r/∂u × ∂r/∂v direction)
*/
EMSCRIPTEN_KEEPALIVE int get_3d_boundary(
    double u_min, double u_max, double du,
    double v_min, double v_max, double dv,
    double* out
) {
    int nu = (int)std::floor((u_max - u_min) / du) + 1;
    int nv = (int)std::floor((v_max - v_min) / dv) + 1;
    if (nu <= 0 || nv <= 0) return 0;

    int n = nu * nv;

    double* u_values  = out;
    double* v_values  = u_values + n;
    double* x_values  = v_values + n;
    double* y_values  = x_values + n;
    double* z_values  = y_values + n;
    double* dS_values = z_values + n;
    double* normal_x  = dS_values + n;
    double* normal_y  = normal_x  + n;
    double* normal_z  = normal_y  + n;

    for (int i = 0; i < nu; ++i) {
        double u = u_min + i * du;
        for (int j = 0; j < nv; ++j) {
            double v = v_min + j * dv;
            int idx = i * nv + j;

            u_values[idx] = u;
            v_values[idx] = v;
            x_values[idx] = x_fn(u, v);
            y_values[idx] = y_fn(u, v);
            z_values[idx] = z_fn(u, v);

            // Cell area: (r(u+du,v) - r(u,v)) × (r(u,v+dv) - r(u,v))
            double dux = x_fn(u + du, v) - x_values[idx];
            double duy = y_fn(u + du, v) - y_values[idx];
            double duz = z_fn(u + du, v) - z_values[idx];
            double dvx = x_fn(u, v + dv) - x_values[idx];
            double dvy = y_fn(u, v + dv) - y_values[idx];
            double dvz = z_fn(u, v + dv) - z_values[idx];

            double cx = duy * dvz - duz * dvy;
            double cy = duz * dvx - dux * dvz;
            double cz = dux * dvy - duy * dvx;
            dS_values[idx] = std::sqrt(cx * cx + cy * cy + cz * cz);
        }
    }

    // Compute unit normal at each point using central differences
    for (int i = 0; i < nu; ++i) {
        double u = u_min + i * du;
        for (int j = 0; j < nv; ++j) {
            double v = v_min + j * dv;
            int idx = i * nv + j;

            double dux = x_fn(u + du * 0.5, v) - x_fn(u - du * 0.5, v);
            double duy = y_fn(u + du * 0.5, v) - y_fn(u - du * 0.5, v);
            double duz = z_fn(u + du * 0.5, v) - z_fn(u - du * 0.5, v);
            double dvx = x_fn(u, v + dv * 0.5) - x_fn(u, v - dv * 0.5);
            double dvy = y_fn(u, v + dv * 0.5) - y_fn(u, v - dv * 0.5);
            double dvz = z_fn(u, v + dv * 0.5) - z_fn(u, v - dv * 0.5);

            double cx = duy * dvz - duz * dvy;
            double cy = duz * dvx - dux * dvz;
            double cz = dux * dvy - duy * dvx;
            double len = std::sqrt(cx * cx + cy * cy + cz * cz);

            if (len < 1e-12) {
                normal_x[idx] = 0.0;
                normal_y[idx] = 0.0;
                normal_z[idx] = 0.0;
            } else {
                normal_x[idx] = cx / len;
                normal_y[idx] = cy / len;
                normal_z[idx] = cz / len;
            }
        }
    }

    return n;
}

}
