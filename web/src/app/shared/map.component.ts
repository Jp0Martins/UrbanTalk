import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';
import { environment } from '../../environments/environment';
import { HeatGrid, MapMarker } from '../core/models';
import { StatusCatalog } from '../core/status-catalog';
import { iconSvg } from './icons';

export interface LatLng {
  lat: number;
  lng: number;
}

// único ponto do sistema que conhece o Leaflet; trocar de provedor de mapa = mexer só aqui e no environment
@Component({
  selector: 'ut-mapa',
  template: `<div #host class="mapa" [attr.aria-label]="label()" role="region"></div>`,
  styles: `
    :host { display: block; position: relative; }
    .mapa { position: absolute; inset: 0; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapComponent implements AfterViewInit, OnDestroy {
  label = input('Mapa de Sorocaba');
  mode = input<'view' | 'pick'>('view');
  markers = input<MapMarker[]>([]);
  selectedId = input<number | null>(null);
  // ajusta o enquadramento para mostrar todos os marcadores quando eles mudam
  fitToMarkers = input(false);
  pickValue = input<LatLng | null>(null);
  interactive = input(true);
  // concentração em grade; quando presente, substitui os marcadores
  heat = input<HeatGrid | null>(null);

  markerSelect = output<number>();
  picked = output<LatLng>();

  private catalog = inject(StatusCatalog);
  private host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private map?: L.Map;
  private layer = L.layerGroup();
  private heatLayer = L.layerGroup();
  private pickMarker?: L.Marker;
  private byId = new Map<number, L.Marker>();
  private resizeObs?: ResizeObserver;
  private lastFitKey = '';

  constructor() {
    effect(() => {
      const list = this.markers();
      if (this.map) this.drawMarkers(list);
    });
    effect(() => {
      const h = this.heat();
      if (this.map) this.drawHeat(h);
    });
    effect(() => {
      const id = this.selectedId();
      if (this.map) this.highlight(id);
    });
    effect(() => {
      const v = this.pickValue();
      if (this.map && this.mode() === 'pick') this.placePick(v, false);
    });
  }

  ngAfterViewInit() {
    const cfg = environment.map;
    const interactive = this.interactive();
    this.map = L.map(this.host().nativeElement, {
      center: cfg.center,
      zoom: cfg.zoom,
      zoomControl: interactive,
      dragging: interactive,
      scrollWheelZoom: false,
      doubleClickZoom: interactive,
      keyboard: interactive,
      attributionControl: true,
    });
    L.tileLayer(cfg.tileUrl, { attribution: cfg.attribution, maxZoom: cfg.maxZoom, referrerPolicy: 'strict-origin-when-cross-origin' }).addTo(this.map);
    this.layer.addTo(this.map);
    this.heatLayer.addTo(this.map);
    // rolagem só depois de clicar no mapa, para não "prender" a página
    this.map.on('focus click', () => this.map?.scrollWheelZoom.enable());
    this.map.on('blur mouseout', () => this.map?.scrollWheelZoom.disable());

    if (this.mode() === 'pick') {
      this.map.on('click', (e: L.LeafletMouseEvent) => {
        const p = { lat: e.latlng.lat, lng: e.latlng.lng };
        this.placePick(p, false);
        this.picked.emit(p);
      });
      this.placePick(this.pickValue(), true);
    } else {
      this.drawMarkers(this.markers());
      this.highlight(this.selectedId());
      this.drawHeat(this.heat());
    }

    this.resizeObs = new ResizeObserver(() => this.map?.invalidateSize({ animate: false }));
    this.resizeObs.observe(this.host().nativeElement);
  }

  // centraliza num ponto, usado por "usar minha localização"
  flyTo(p: LatLng, zoom = 17) {
    this.map?.setView([p.lat, p.lng], zoom);
  }

  private drawMarkers(list: MapMarker[]) {
    this.layer.clearLayers();
    this.byId.clear();
    for (const m of list) {
      const place = m.street ? `${m.street}, ${m.neighborhoodName}` : m.neighborhoodName;
      const title = `${m.code}: ${m.categoryName}, ${place} (${this.catalog.name(m.status)})`;
      const marker = L.marker([m.latitude, m.longitude], {
        icon: this.pinIcon(m, false),
        title,
        alt: title,
        keyboard: true,
        riseOnHover: true,
      });
      marker.on('click keypress', () => this.markerSelect.emit(m.id));
      marker.addTo(this.layer);
      this.byId.set(m.id, marker);
    }
    const key = list.map((m) => m.id).join(',');
    if (this.fitToMarkers() && list.length && key !== this.lastFitKey) {
      this.lastFitKey = key;
      const bounds = L.latLngBounds(list.map((m) => [m.latitude, m.longitude] as L.LatLngTuple));
      this.map!.fitBounds(bounds.pad(0.15), { maxZoom: 15, animate: false });
    }
  }

  // quadrados de ~500 m com 5 tons conforme a contagem relativa ao maior quadrado
  private drawHeat(h: HeatGrid | null) {
    this.heatLayer.clearLayers();
    if (!h) {
      this.layer.addTo(this.map!);
      return;
    }
    this.layer.remove();
    const tones = ['#fde9b8', '#f8c66b', '#ee9437', '#d1601b', '#9e3412'];
    for (const c of h.cells) {
      const level = h.max <= 1 ? 0 : Math.min(4, Math.floor(((c.count - 1) / (h.max - 1)) * 4.999));
      const rect = L.rectangle(
        [
          [c.south, c.west],
          [c.north, c.east],
        ],
        { color: tones[level], weight: 1, fillColor: tones[level], fillOpacity: h.reliable ? 0.55 : 0.35, interactive: true },
      );
      rect.bindTooltip(`${c.count} ${c.count === 1 ? 'registro' : 'registros'} (${c.open} em aberto) neste quadrado de ~${h.cellMeters} m`, { sticky: true });
      rect.addTo(this.heatLayer);
    }
    if (h.cells.length && this.fitToMarkers()) {
      const b = L.latLngBounds(h.cells.flatMap((c) => [[c.south, c.west], [c.north, c.east]] as L.LatLngTuple[]));
      this.map!.fitBounds(b.pad(0.1), { maxZoom: 15, animate: false });
    }
  }

  private highlight(id: number | null) {
    for (const [mid, marker] of this.byId) {
      const el = marker.getElement()?.querySelector('.ut-pin');
      el?.classList.toggle('selecionado', mid === id);
      if (mid === id) {
        marker.setZIndexOffset(1000);
        const ll = marker.getLatLng();
        if (!this.map!.getBounds().pad(-0.1).contains(ll)) this.map!.panTo(ll, { animate: false });
      } else marker.setZIndexOffset(0);
    }
  }

  private pinIcon(m: MapMarker, selected: boolean) {
    return L.divIcon({
      className: 'ut-marker',
      html: `<div class="ut-pin${selected ? ' selecionado' : ''}" data-color="${this.catalog.get(m.status).color}">${iconSvg(m.categoryIcon, 16)}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
  }

  private placePick(p: LatLng | null, center: boolean) {
    if (!this.map) return;
    if (!p) {
      this.pickMarker?.remove();
      this.pickMarker = undefined;
      return;
    }
    if (!this.pickMarker) {
      this.pickMarker = L.marker([p.lat, p.lng], {
        draggable: true,
        keyboard: true,
        title: 'Local do problema. Arraste para ajustar.',
        alt: 'Local do problema',
        icon: L.divIcon({ className: 'ut-marker', html: '<div class="ut-pin-escolha"></div>', iconSize: [34, 34], iconAnchor: [17, 34] }),
      }).addTo(this.map);
      this.pickMarker.on('dragend', () => {
        const ll = this.pickMarker!.getLatLng();
        this.picked.emit({ lat: ll.lat, lng: ll.lng });
      });
    } else {
      this.pickMarker.setLatLng([p.lat, p.lng]);
    }
    if (center) this.map.setView([p.lat, p.lng], 17);
  }

  ngOnDestroy() {
    this.resizeObs?.disconnect();
    // para animações pendentes antes de destruir, evitando erro do Leaflet ao trocar de página
    this.map?.stop();
    this.map?.off();
    this.map?.remove();
    this.map = undefined;
  }
}
