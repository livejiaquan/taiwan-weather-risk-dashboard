import { COUNTIES } from "./riskEngine";

/**
 * Enforce the warning-feed contract used by both the browser and the cache
 * generator. Throwing preserves a useful path-specific reason for CI and
 * freshness probes; browser callers can convert failure to a boolean.
 */
export function validateWarningPayload(payload: unknown): void {
  const cwaopendata = requireRecord(payload, "warning payload").cwaopendata;
  const envelope = requireRecord(cwaopendata, "warning payload.cwaopendata");
  if (!isParseableDate(envelope.sent)) {
    throw new Error("warning payload.cwaopendata.sent must be a parseable date-time");
  }

  const dataset = requireRecord(envelope.dataset, "warning payload.cwaopendata.dataset");
  if (!hasOwn(dataset, "location")) {
    throw new Error("warning payload.cwaopendata.dataset.location is required");
  }

  const rawLocations = dataset.location;
  const locations = Array.isArray(rawLocations)
    ? rawLocations
    : isRecord(rawLocations)
      ? [rawLocations]
      : rawLocations === null
        ? []
        : null;
  if (locations === null) {
    throw new Error("warning payload dataset.location must be an object, array, or null");
  }

  const expectedByCountyName = new Map(COUNTIES.map((county) => [county.countyName, county.geocode]));
  const seenCountyNames = new Set<string>();
  const seenGeocodes = new Set<string>();

  locations.forEach((rawLocation, index) => {
    const location = requireRecord(rawLocation, `warning payload dataset.location[${index}]`);
    const countyName = isNonEmptyString(location.locationName) ? location.locationName : "";
    const geocode = isNonEmptyString(location.geocode) ? location.geocode : "";
    if (!countyName || !geocode) {
      throw new Error(`warning payload dataset.location[${index}] requires countyName and geocode`);
    }
    if (seenCountyNames.has(countyName)) {
      throw new Error(`warning payload contains duplicate countyName: ${countyName}`);
    }
    if (seenGeocodes.has(geocode)) {
      throw new Error(`warning payload contains duplicate geocode: ${geocode}`);
    }

    const expectedGeocode = expectedByCountyName.get(countyName);
    if (expectedGeocode === undefined) {
      throw new Error(`warning payload contains unknown countyName: ${countyName}`);
    }
    if (geocode !== expectedGeocode) {
      throw new Error(
        `warning payload geocode mismatch for ${countyName}: expected ${expectedGeocode}, received ${geocode}`,
      );
    }

    validateWarningHazardConditions(location, index);

    seenCountyNames.add(countyName);
    seenGeocodes.add(geocode);
  });

  const missingCountyNames = COUNTIES.filter((county) => !seenCountyNames.has(county.countyName)).map(
    (county) => county.countyName,
  );
  if (missingCountyNames.length > 0 || locations.length !== COUNTIES.length) {
    throw new Error(
      `warning payload must cover exactly ${COUNTIES.length} counties; missing: ${missingCountyNames.join(", ") || "none"}`,
    );
  }
}

export function hasValidWarningPayload(payload: unknown): boolean {
  try {
    validateWarningPayload(payload);
    return true;
  } catch {
    return false;
  }
}

function validateWarningHazardConditions(location: Record<string, unknown>, locationIndex: number): void {
  const locationPath = `warning payload dataset.location[${locationIndex}]`;
  if (!hasOwn(location, "hazardConditions")) {
    throw new Error(`${locationPath}.hazardConditions is required`);
  }

  const rawConditions = location.hazardConditions;
  if (rawConditions === null) return;

  const conditions = requireRecord(rawConditions, `${locationPath}.hazardConditions`);
  if (!hasOwn(conditions, "hazards")) {
    throw new Error(`${locationPath}.hazardConditions.hazards is required`);
  }

  const rawHazards = conditions.hazards;
  const hazards = Array.isArray(rawHazards)
    ? rawHazards
    : isRecord(rawHazards)
      ? [rawHazards]
      : null;
  if (!hazards || hazards.length === 0) {
    throw new Error(`${locationPath}.hazardConditions.hazards must be an object or non-empty array`);
  }

  hazards.forEach((rawHazard, hazardIndex) => {
    const hazardPath = `${locationPath}.hazardConditions.hazards[${hazardIndex}]`;
    const hazard = requireRecord(rawHazard, hazardPath);
    const info = requireRecord(hazard.info, `${hazardPath}.info`);
    if (!isNonEmptyString(info.phenomena) || !isNonEmptyString(info.significance)) {
      throw new Error(`${hazardPath}.info requires non-empty phenomena and significance`);
    }

    const validTime = requireRecord(hazard.validTime, `${hazardPath}.validTime`);
    if (!isParseableDate(validTime.startTime) || !isParseableDate(validTime.endTime)) {
      throw new Error(`${hazardPath}.validTime requires parseable startTime and endTime`);
    }
    if (Date.parse(validTime.startTime) >= Date.parse(validTime.endTime)) {
      throw new Error(`${hazardPath}.validTime startTime must be before endTime`);
    }

    validateAffectedAreas(hazard, hazardPath);
  });
}

function validateAffectedAreas(hazard: Record<string, unknown>, hazardPath: string): void {
  if (!hasOwn(hazard, "hazard")) return;

  const rawDetails = hazard.hazard;
  const details = Array.isArray(rawDetails) ? rawDetails : isRecord(rawDetails) ? [rawDetails] : null;
  if (!details || details.length === 0) {
    throw new Error(`${hazardPath}.hazard must be an object or non-empty array`);
  }

  details.forEach((rawDetail, detailIndex) => {
    const detailPath = `${hazardPath}.hazard[${detailIndex}]`;
    const detail = requireRecord(rawDetail, detailPath);
    const detailInfo = requireRecord(detail.info, `${detailPath}.info`);
    if (!hasOwn(detailInfo, "affectedAreas")) return;

    const affectedAreas = requireRecord(detailInfo.affectedAreas, `${detailPath}.info.affectedAreas`);
    if (!hasOwn(affectedAreas, "location")) {
      throw new Error(`${detailPath}.info.affectedAreas.location is required`);
    }

    const rawLocations = affectedAreas.location;
    const locations = Array.isArray(rawLocations)
      ? rawLocations
      : isRecord(rawLocations)
        ? [rawLocations]
        : null;
    if (!locations || locations.length === 0) {
      throw new Error(`${detailPath}.info.affectedAreas.location must be an object or non-empty array`);
    }

    locations.forEach((rawLocation, index) => {
      const location = requireRecord(rawLocation, `${detailPath}.info.affectedAreas.location[${index}]`);
      if (!isNonEmptyString(location.locationName)) {
        throw new Error(`${detailPath}.info.affectedAreas.location[${index}].locationName is required`);
      }
    });
  });
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isParseableDate(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}
