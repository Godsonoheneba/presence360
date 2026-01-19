import type { Location, Service, ServiceSession } from "@/lib/types";

export function formatDateTime(value?: string | null) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatTime(value?: string | null) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatDate(value?: string | null) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

export function formatConfidence(value?: number | null) {
  if (value === null || value === undefined) {
    return "—";
  }
  const normalized = value > 1 ? value : value * 100;
  return `${normalized.toFixed(1)}%`;
}

export function formatSessionLabel(
  session: ServiceSession,
  services: Record<string, Service>,
  locations: Record<string, Location>,
) {
  const service = session.service_id ? services[session.service_id] : undefined;
  const location = service?.location_id ? locations[service.location_id] : undefined;
  const serviceName = service?.name || "Service";
  const locationName = location?.name || "Unknown location";
  const timeValue = session.started_at || session.ended_at;
  const timeLabel = formatTime(timeValue);
  const dateLabel = formatDate(timeValue);
  if (!timeLabel || !dateLabel) {
    return `${serviceName} — ${locationName}`;
  }
  return `${serviceName} — ${locationName} — ${timeLabel} (${dateLabel})`;
}
