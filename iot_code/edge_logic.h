#pragma once
#include <math.h>
constexpr float DISTANCIA_SENSOR_FONDO_CM = 20.0f;
constexpr float NIVEL_MEDIO_CM = 4.0f, NIVEL_ALTO_CM = 8.0f, NIVEL_CRITICO_CM = 10.0f;
constexpr float VELOCIDAD_ALTA_CM_MIN = 2.0f, MINUTOS_PREDICCION = 3.0f;
enum EstadoRiesgo { NORMAL = 0, MEDIO = 1, ALTO = 2, CRITICO = 3 };
inline float calcularNivel(float distancia) {
  if (!isfinite(distancia) || distancia <= 0 || distancia >= 400) return NAN;
  return fmaxf(0, fminf(DISTANCIA_SENSOR_FONDO_CM, DISTANCIA_SENSOR_FONDO_CM - distancia));
}
inline EstadoRiesgo evaluarEstado(float nivel, float velocidad, float proyeccion) {
  if (nivel >= NIVEL_CRITICO_CM || proyeccion >= NIVEL_CRITICO_CM) return CRITICO;
  if (nivel >= NIVEL_ALTO_CM || velocidad >= VELOCIDAD_ALTA_CM_MIN) return ALTO;
  if (nivel >= NIVEL_MEDIO_CM) return MEDIO;
  return NORMAL;
}
inline const char* textoEstado(EstadoRiesgo estado) {
  switch (estado) {
    case NORMAL: return "NORMAL";
    case MEDIO: return "MEDIO";
    case ALTO: return "ALTO";
    case CRITICO: return "CRITICO";
    default: return "ERROR";
  }
}
