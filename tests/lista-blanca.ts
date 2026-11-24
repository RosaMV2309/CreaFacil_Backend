/**
 * Utilidad de las pruebas de LISTA BLANCA del catálogo público: recorre el JSON entero y devuelve
 * todas las rutas de claves (`categorias[].servicios[].precioReferencial.desde`). Si alguien añade
 * un campo interno a una respuesta pública, la comparación exacta con la lista permitida falla.
 */
export function rutasDeClaves(valor: unknown, prefijo = ''): string[] {
  if (Array.isArray(valor)) {
    return [...new Set(valor.flatMap((elemento) => rutasDeClaves(elemento, `${prefijo}[]`)))];
  }
  if (valor !== null && typeof valor === 'object') {
    return Object.entries(valor).flatMap(([clave, hijo]) => {
      const ruta = prefijo ? `${prefijo}.${clave}` : clave;
      return [ruta, ...rutasDeClaves(hijo, ruta)];
    });
  }
  return [];
}

/** Nombre de cada clave (sin la ruta), para buscar nombres prohibidos en cualquier nivel. */
export const nombresDeClaves = (valor: unknown): string[] =>
  rutasDeClaves(valor).map((ruta) => (ruta.split('.').at(-1) ?? '').replace(/\[\]$/, ''));

/** Claves que NUNCA pueden aparecer en una respuesta pública del catálogo. */
export const CLAVES_PROHIBIDAS = [
  'activo',
  'activa',
  'precioUnitario',
  'precioBaseReferencial',
  'horasManoObraReferencia',
  'cantidadReferencial',
  'clave',
  'tipoMime',
  'tamanoBytes',
  'orden',
  'creadoEn',
  'actualizadoEn',
  'createdAt',
  'updatedAt',
  'numeroFotos',
  'serviciosActivos',
  'serviciosTotales',
  'materiales',
  'unidad',
  'categoriaId',
];

/** Lista blanca exacta de `GET /catalogo` (con al menos un servicio con portada y precio). */
export const CLAVES_CATALOGO = [
  'categorias',
  'categorias[].id',
  'categorias[].nombre',
  'categorias[].descripcion',
  'categorias[].servicios',
  'categorias[].servicios[].id',
  'categorias[].servicios[].nombre',
  'categorias[].servicios[].portadaUrl',
  'categorias[].servicios[].precioReferencial',
  'categorias[].servicios[].precioReferencial.desde',
  'categorias[].servicios[].precioReferencial.esReferencial',
].sort();

/** Lista blanca exacta de `GET /catalogo/servicios/:id` (con fotos y precio). */
export const CLAVES_FICHA = [
  'servicio',
  'servicio.id',
  'servicio.nombre',
  'servicio.categoria',
  'servicio.categoria.id',
  'servicio.categoria.nombre',
  'servicio.descripcion',
  'servicio.dimensionesOrientativas',
  'servicio.observaciones',
  'servicio.materialesHabituales',
  'servicio.fotos',
  'servicio.fotos[].url',
  'servicio.precioReferencial',
  'servicio.precioReferencial.desde',
  'servicio.precioReferencial.esReferencial',
].sort();
