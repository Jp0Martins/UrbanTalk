// configuração usada no build de produção (servido pela própria API)
export const environment = {
  production: true,
  // endereço base da API; relativo para funcionar no mesmo domínio do site
  apiUrl: '/api',
  map: {
    // OpenStreetMap: gratuito, sem chave. Para trocar de provedor, altere aqui e em MAP_TILE_HOSTS na API
    tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">colaboradores do OpenStreetMap</a>',
    maxZoom: 19,
    center: [-23.5015, -47.4526] as [number, number],
    zoom: 13,
  },
};
