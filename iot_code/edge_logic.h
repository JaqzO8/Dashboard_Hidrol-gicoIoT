#pragma once
#include <math.h>
constexpr float DISTANCIA_SENSOR_FONDO_CM = 18.0f;
constexpr float ALTURA_MAXIMA_AGUA_CM = 12.0f;
constexpr float NIVEL_MEDIO_CM = 6.0f, NIVEL_ALTO_CM = 8.0f, NIVEL_CRITICO_CM = 10.0f;
constexpr float VELOCIDAD_ALTA_CM_MIN = 2.0f, MINUTOS_PREDICCION = 3.0f;
enum EstadoRiesgo { NORMAL = 0, MEDIO = 1, ALTO = 2, CRITICO = 3 };
inline float calcularNivel(float distancia) {
  if (!isfinite(distancia) || distancia <= 0 || distancia >= 400) return NAN;
  return fmaxf(0, fminf(DISTANCIA_SENSOR_FONDO_CM, DISTANCIA_SENSOR_FONDO_CM - distancia));
}
inline EstadoRiesgo evaluarEstado(float nivel, float velocidad, float proyeccion) {
  // El estado describe el agua medida. La estimación se muestra por separado.
  if (nivel >= NIVEL_CRITICO_CM) return CRITICO;
  if (nivel >= NIVEL_ALTO_CM) return ALTO;
  if (nivel >= NIVEL_MEDIO_CM) return MEDIO;
  return NORMAL;
}

struct TendenciaNivel {
  float levels[16] = {};
  uint32_t times[16] = {};
  unsigned count = 0;
  void reset() { count = 0; }
  float update(float level, uint32_t now) {
    if (count && now - times[count - 1] < 2000) return NAN;
    if (count == 16) {
      for (unsigned i = 1; i < 16; i++) { levels[i-1] = levels[i]; times[i-1] = times[i]; }
      count--;
    }
    levels[count] = level; times[count++] = now;
    if (count < 16 || now - times[0] < 30000) return NAN;
    float sx=0, sy=0, sxx=0, sxy=0;
    for (unsigned i=0;i<count;i++) {
      const float x=(times[i]-times[0])/60000.0f;
      sx+=x; sy+=levels[i]; sxx+=x*x; sxy+=x*levels[i];
    }
    const float slope=(count*sxy-sx*sy)/(count*sxx-sx*sx);
    return fabsf(slope)<0.3f ? 0.0f : slope;
  }
};
inline const char* textoEstado(EstadoRiesgo estado) {
  switch (estado) {
    case NORMAL: return "NORMAL";
    case MEDIO: return "MEDIO";
    case ALTO: return "ALTO";
    case CRITICO: return "CRITICO";
    default: return "ERROR";
  }
}
