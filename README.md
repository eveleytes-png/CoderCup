# Catálogo del Corredor - CoderCup

MVP para importar la lista PDF de Lanús Alambres, normalizar sus productos, buscarlos y conservar imágenes agregadas manualmente.

## Ejecutar

```bash
pnpm install
pnpm dev
```

Abrir `http://localhost:3000`. Sin configuración externa, los datos quedan guardados en el navegador actual.

## Persistencia en Supabase

1. Crear un proyecto en Supabase.
2. Ejecutar `supabase/schema.sql` en el SQL Editor.
3. Copiar `.env.example` como `.env.local` y completar la URL y la clave pública `anon`.
4. Reiniciar la aplicación.

La clave `anon` es pública por diseño. Nunca colocar una clave `service_role` en variables `NEXT_PUBLIC_*`.
