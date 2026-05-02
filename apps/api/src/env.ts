export interface Env {
  UNVERSE_CACHE: KVNamespace
  OPENWEATHER_API_KEY?: string
  ALLOWED_ORIGINS: string
}

export type AppBindings = {
  Bindings: Env
}
