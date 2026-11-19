-- Fase 2 · 2.2: servicios del catálogo y sus fotografías (RF-04, RF-05, RF-22).

-- RF-04: la ficha «podrá incluir» descripción; deja de ser obligatoria.
ALTER TABLE "servicios" ALTER COLUMN "descripcion" DROP NOT NULL;

-- Fotos guardadas por la propia API detrás de una interfaz de almacenamiento intercambiable:
-- - clave: nombre interno ALEATORIO del archivo («<uuid>.png»); permite borrarlo y recalcular su URL
--   pública si cambia PUBLIC_BASE_URL o el proveedor. Nula solo en imágenes externas sin archivo.
-- - tipo_mime: tipo detectado por el CONTENIDO (firma del archivo), no por la extensión.
-- - tamano_bytes: tamaño del archivo (máximo 5 MB, lo comprueba la API).
ALTER TABLE "imagenes_servicio" ADD COLUMN "clave" VARCHAR(200),
ADD COLUMN "tamano_bytes" INTEGER,
ADD COLUMN "tipo_mime" VARCHAR(50);

CREATE UNIQUE INDEX "imagenes_servicio_clave_key" ON "imagenes_servicio"("clave");

-- Restricciones añadidas a mano (Prisma no las modela, pero no las borra).
ALTER TABLE "imagenes_servicio" ADD CONSTRAINT "imagenes_servicio_valores_validos" CHECK (
  "orden" >= 0
  AND ("tamano_bytes" IS NULL OR "tamano_bytes" > 0)
  AND ("tipo_mime" IS NULL OR "tipo_mime" IN ('image/jpeg', 'image/png', 'image/webp'))
);
