# Catálogo del Corredor - CoderCup

MVP para importar la lista PDF de Lanús Alambres, normalizar sus productos, buscarlos y conservar imágenes agregadas manualmente.

## Ejecutar

```bash
pnpm install
pnpm dev
```

Abrir `http://localhost:3000`. Sin configuración externa, los datos quedan guardados en el navegador actual.

## Despliegue en Vercel

1. Conectar este repositorio a un proyecto de Vercel.
2. Crear una base Neon Postgres y un store público de Vercel Blob desde el Marketplace de Vercel.
3. Ejecutar `drizzle/0000_initial.sql` en Neon.
4. Configurar las variables `DATABASE_URL` y `BLOB_READ_WRITE_TOKEN` en Vercel y en `.env.local` para el desarrollo local.

Las credenciales son privadas: no deben llevar el prefijo `NEXT_PUBLIC_` ni subirse al repositorio.
