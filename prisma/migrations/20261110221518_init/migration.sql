-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('CLIENTE', 'ADMIN');

-- CreateEnum
CREATE TYPE "NivelComplejidad" AS ENUM ('BAJA', 'MEDIA', 'ALTA');

-- CreateEnum
CREATE TYPE "EstadoCotizacion" AS ENUM ('PENDIENTE', 'ENVIADA', 'ACEPTADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('PENDIENTE', 'ENVIADA', 'ACEPTADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "EstadoPedido" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'LISTO', 'ENTREGADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('COTIZACION_DISPONIBLE', 'PEDIDO_ACEPTADO', 'CAMBIO_ESTADO_PEDIDO', 'ENTREGA_PROXIMA');

-- CreateEnum
CREATE TYPE "PlataformaDispositivo" AS ENUM ('ANDROID', 'WEB', 'IOS');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" VARCHAR(100) NOT NULL,
    "telefono" VARCHAR(30),
    "rol" "Rol" NOT NULL DEFAULT 'CLIENTE',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "descripcion" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicios" (
    "id" UUID NOT NULL,
    "categoria_id" UUID NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "dimensiones_orientativas" VARCHAR(200),
    "observaciones" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "precio_base_referencial" DECIMAL(12,2),
    "horas_mano_obra_referencia" DECIMAL(8,2),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "servicios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imagenes_servicio" (
    "id" UUID NOT NULL,
    "servicio_id" UUID NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "texto_alternativo" VARCHAR(200),
    "orden" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imagenes_servicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicios_materiales" (
    "servicio_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "cantidad_referencial" DECIMAL(10,2),

    CONSTRAINT "servicios_materiales_pkey" PRIMARY KEY ("servicio_id","material_id")
);

-- CreateTable
CREATE TABLE "materiales" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "descripcion" TEXT,
    "unidad" VARCHAR(40) NOT NULL,
    "precio_unitario" DECIMAL(12,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "materiales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuraciones_precios" (
    "id" UUID NOT NULL,
    "costo_mano_obra_hora" DECIMAL(12,2) NOT NULL,
    "factor_complejidad_baja" DECIMAL(4,2) NOT NULL,
    "factor_complejidad_media" DECIMAL(4,2) NOT NULL,
    "factor_complejidad_alta" DECIMAL(4,2) NOT NULL,
    "vigente_desde" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigente_hasta" TIMESTAMPTZ(3),
    "creada_por_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configuraciones_precios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizaciones" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "servicio_id" UUID NOT NULL,
    "configuracion_precios_id" UUID NOT NULL,
    "ancho_cm" DECIMAL(10,2),
    "alto_cm" DECIMAL(10,2),
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "detalles_diseno" TEXT NOT NULL,
    "complejidad" "NivelComplejidad" NOT NULL,
    "horas_mano_obra" DECIMAL(8,2) NOT NULL,
    "costo_mano_obra_hora" DECIMAL(12,2) NOT NULL,
    "factor_complejidad" DECIMAL(4,2) NOT NULL,
    "subtotal_materiales" DECIMAL(12,2) NOT NULL,
    "costo_mano_obra" DECIMAL(12,2) NOT NULL,
    "valor_estimado" DECIMAL(12,2) NOT NULL,
    "precio_final" DECIMAL(12,2),
    "es_estimada" BOOLEAN NOT NULL DEFAULT true,
    "estado" "EstadoCotizacion" NOT NULL DEFAULT 'PENDIENTE',
    "observaciones_admin" TEXT,
    "enviada_en" TIMESTAMPTZ(3),
    "respondida_en" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cotizaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalles_cotizacion_materiales" (
    "id" UUID NOT NULL,
    "cotizacion_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "precio_unitario" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "detalles_cotizacion_materiales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "servicio_id" UUID,
    "cotizacion_id" UUID,
    "descripcion" TEXT NOT NULL,
    "fecha_deseada" DATE NOT NULL,
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'PENDIENTE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "solicitudes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imagenes_solicitud" (
    "id" UUID NOT NULL,
    "solicitud_id" UUID NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imagenes_solicitud_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "solicitud_id" UUID,
    "cotizacion_id" UUID,
    "precio_acordado" DECIMAL(12,2) NOT NULL,
    "fecha_inicio_prevista" DATE NOT NULL,
    "fecha_entrega_prevista" DATE NOT NULL,
    "duracion_estimada_dias" INTEGER NOT NULL,
    "estado" "EstadoPedido" NOT NULL DEFAULT 'PENDIENTE',
    "notas" TEXT,
    "entregado_en" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_estados_pedido" (
    "id" UUID NOT NULL,
    "pedido_id" UUID NOT NULL,
    "estado_anterior" "EstadoPedido",
    "estado_nuevo" "EstadoPedido" NOT NULL,
    "usuario_id" UUID NOT NULL,
    "comentario" TEXT,
    "fecha" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_estados_pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo" "TipoNotificacion" NOT NULL,
    "titulo" VARCHAR(120) NOT NULL,
    "mensaje" TEXT NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "leida_en" TIMESTAMPTZ(3),
    "referencia_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispositivos_fcm" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "token" VARCHAR(512) NOT NULL,
    "plataforma" "PlataformaDispositivo" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dispositivos_fcm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_rol_idx" ON "usuarios"("rol");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_nombre_key" ON "categorias"("nombre");

-- CreateIndex
CREATE INDEX "categorias_activa_orden_idx" ON "categorias"("activa", "orden");

-- CreateIndex
CREATE INDEX "servicios_activo_idx" ON "servicios"("activo");

-- CreateIndex
CREATE UNIQUE INDEX "servicios_categoria_id_nombre_key" ON "servicios"("categoria_id", "nombre");

-- CreateIndex
CREATE INDEX "imagenes_servicio_servicio_id_orden_idx" ON "imagenes_servicio"("servicio_id", "orden");

-- CreateIndex
CREATE INDEX "servicios_materiales_material_id_idx" ON "servicios_materiales"("material_id");

-- CreateIndex
CREATE UNIQUE INDEX "materiales_nombre_key" ON "materiales"("nombre");

-- CreateIndex
CREATE INDEX "materiales_activo_idx" ON "materiales"("activo");

-- CreateIndex
CREATE INDEX "configuraciones_precios_vigente_hasta_idx" ON "configuraciones_precios"("vigente_hasta");

-- CreateIndex
CREATE INDEX "cotizaciones_cliente_id_created_at_idx" ON "cotizaciones"("cliente_id", "created_at");

-- CreateIndex
CREATE INDEX "cotizaciones_estado_created_at_idx" ON "cotizaciones"("estado", "created_at");

-- CreateIndex
CREATE INDEX "cotizaciones_servicio_id_idx" ON "cotizaciones"("servicio_id");

-- CreateIndex
CREATE INDEX "detalles_cotizacion_materiales_material_id_idx" ON "detalles_cotizacion_materiales"("material_id");

-- CreateIndex
CREATE UNIQUE INDEX "detalles_cotizacion_materiales_cotizacion_id_material_id_key" ON "detalles_cotizacion_materiales"("cotizacion_id", "material_id");

-- CreateIndex
CREATE UNIQUE INDEX "solicitudes_cotizacion_id_key" ON "solicitudes"("cotizacion_id");

-- CreateIndex
CREATE INDEX "solicitudes_cliente_id_created_at_idx" ON "solicitudes"("cliente_id", "created_at");

-- CreateIndex
CREATE INDEX "solicitudes_estado_fecha_deseada_idx" ON "solicitudes"("estado", "fecha_deseada");

-- CreateIndex
CREATE INDEX "imagenes_solicitud_solicitud_id_orden_idx" ON "imagenes_solicitud"("solicitud_id", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_solicitud_id_key" ON "pedidos"("solicitud_id");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_cotizacion_id_key" ON "pedidos"("cotizacion_id");

-- CreateIndex
CREATE INDEX "pedidos_cliente_id_created_at_idx" ON "pedidos"("cliente_id", "created_at");

-- CreateIndex
CREATE INDEX "pedidos_estado_idx" ON "pedidos"("estado");

-- CreateIndex
CREATE INDEX "pedidos_fecha_inicio_prevista_fecha_entrega_prevista_idx" ON "pedidos"("fecha_inicio_prevista", "fecha_entrega_prevista");

-- CreateIndex
CREATE INDEX "historial_estados_pedido_pedido_id_fecha_idx" ON "historial_estados_pedido"("pedido_id", "fecha");

-- CreateIndex
CREATE INDEX "notificaciones_usuario_id_leida_created_at_idx" ON "notificaciones"("usuario_id", "leida", "created_at");

-- CreateIndex
CREATE INDEX "notificaciones_tipo_referencia_id_idx" ON "notificaciones"("tipo", "referencia_id");

-- CreateIndex
CREATE UNIQUE INDEX "dispositivos_fcm_token_key" ON "dispositivos_fcm"("token");

-- CreateIndex
CREATE INDEX "dispositivos_fcm_usuario_id_idx" ON "dispositivos_fcm"("usuario_id");

-- AddForeignKey
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imagenes_servicio" ADD CONSTRAINT "imagenes_servicio_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios_materiales" ADD CONSTRAINT "servicios_materiales_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios_materiales" ADD CONSTRAINT "servicios_materiales_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materiales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuraciones_precios" ADD CONSTRAINT "configuraciones_precios_creada_por_id_fkey" FOREIGN KEY ("creada_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_configuracion_precios_id_fkey" FOREIGN KEY ("configuracion_precios_id") REFERENCES "configuraciones_precios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_cotizacion_materiales" ADD CONSTRAINT "detalles_cotizacion_materiales_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "cotizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_cotizacion_materiales" ADD CONSTRAINT "detalles_cotizacion_materiales_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materiales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "cotizaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imagenes_solicitud" ADD CONSTRAINT "imagenes_solicitud_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "cotizaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_estados_pedido" ADD CONSTRAINT "historial_estados_pedido_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_estados_pedido" ADD CONSTRAINT "historial_estados_pedido_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispositivos_fcm" ADD CONSTRAINT "dispositivos_fcm_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Restricciones añadidas a mano (Prisma no las modela, pero las respeta: no las borra).
-- Son la última barrera de integridad; los servicios validan lo mismo antes (RNF-04).
-- ---------------------------------------------------------------------------

-- Importes y cantidades no negativos (RF-07, RF-08).
ALTER TABLE "materiales" ADD CONSTRAINT "materiales_precio_unitario_no_negativo" CHECK ("precio_unitario" >= 0);
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_precio_base_no_negativo" CHECK ("precio_base_referencial" IS NULL OR "precio_base_referencial" >= 0);
ALTER TABLE "configuraciones_precios" ADD CONSTRAINT "configuraciones_precios_valores_validos" CHECK (
  "costo_mano_obra_hora" >= 0
  AND "factor_complejidad_baja" > 0
  AND "factor_complejidad_media" > 0
  AND "factor_complejidad_alta" > 0
  AND ("vigente_hasta" IS NULL OR "vigente_hasta" >= "vigente_desde")
);
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_valores_validos" CHECK (
  "cantidad" > 0
  AND "valor_estimado" >= 0
  AND ("precio_final" IS NULL OR "precio_final" >= 0)
  AND ("ancho_cm" IS NULL OR "ancho_cm" > 0)
  AND ("alto_cm" IS NULL OR "alto_cm" > 0)
);
ALTER TABLE "detalles_cotizacion_materiales" ADD CONSTRAINT "detalles_cotizacion_cantidad_positiva" CHECK ("cantidad" > 0 AND "precio_unitario" >= 0);

-- Pedido (RF-12, RF-16, RN-02): tiene un origen, un precio no negativo y fechas coherentes.
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_con_origen" CHECK ("solicitud_id" IS NOT NULL OR "cotizacion_id" IS NOT NULL);
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_precio_acordado_no_negativo" CHECK ("precio_acordado" >= 0);
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_fechas_coherentes" CHECK ("fecha_entrega_prevista" >= "fecha_inicio_prevista" AND "duracion_estimada_dias" > 0);