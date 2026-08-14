export const ABU_DHABI_LATITUDE = 24.4539;
export const ABU_DHABI_LONGITUDE = 54.3773;
export const ABU_DHABI_TIME_ZONE = 'Asia/Dubai';

const DAY_MS = 24 * 60 * 60 * 1000;
const OFFICIAL_ZENITH = 90.833;

type AbuDhabiDate = {
  year: number;
  month: number;
  day: number;
};

export type AbuDhabiSunTimes = {
  sunrise: Date;
  sunset: Date;
};

function degreesToRadians(value: number) {
  return value * (Math.PI / 180);
}

function radiansToDegrees(value: number) {
  return value * (180 / Math.PI);
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function normalizeHours(value: number) {
  return ((value % 24) + 24) % 24;
}

function abuDhabiCalendarDate(at: Date): AbuDhabiDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ABU_DHABI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day') };
}

function dayOfYear({ year, month, day }: AbuDhabiDate) {
  return Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 0)) / DAY_MS);
}

function calculateSolarEvent(date: AbuDhabiDate, sunrise: boolean) {
  const longitudeHour = ABU_DHABI_LONGITUDE / 15;
  const approximateTime = dayOfYear(date) + ((sunrise ? 6 : 18) - longitudeHour) / 24;
  const meanAnomaly = (0.9856 * approximateTime) - 3.289;
  const trueLongitude = normalizeDegrees(
    meanAnomaly
      + (1.916 * Math.sin(degreesToRadians(meanAnomaly)))
      + (0.02 * Math.sin(degreesToRadians(2 * meanAnomaly)))
      + 282.634,
  );

  let rightAscension = normalizeDegrees(
    radiansToDegrees(Math.atan(0.91764 * Math.tan(degreesToRadians(trueLongitude)))),
  );
  rightAscension += Math.floor(trueLongitude / 90) * 90 - Math.floor(rightAscension / 90) * 90;
  rightAscension /= 15;

  const sinDeclination = 0.39782 * Math.sin(degreesToRadians(trueLongitude));
  const cosDeclination = Math.cos(Math.asin(sinDeclination));
  const cosHourAngle = (
    Math.cos(degreesToRadians(OFFICIAL_ZENITH))
      - (sinDeclination * Math.sin(degreesToRadians(ABU_DHABI_LATITUDE)))
  ) / (cosDeclination * Math.cos(degreesToRadians(ABU_DHABI_LATITUDE)));

  const hourAngle = sunrise
    ? 360 - radiansToDegrees(Math.acos(cosHourAngle))
    : radiansToDegrees(Math.acos(cosHourAngle));
  const localMeanTime = (hourAngle / 15) + rightAscension - (0.06571 * approximateTime) - 6.622;
  const utcHours = normalizeHours(localMeanTime - longitudeHour);

  return new Date(Date.UTC(date.year, date.month - 1, date.day) + (utcHours * 60 * 60 * 1000));
}

export function getAbuDhabiSunTimes(at = new Date()): AbuDhabiSunTimes {
  const date = abuDhabiCalendarDate(at);
  return {
    sunrise: calculateSolarEvent(date, true),
    sunset: calculateSolarEvent(date, false),
  };
}

export function isNightInAbuDhabi(at = new Date()) {
  const { sunrise, sunset } = getAbuDhabiSunTimes(at);
  return at < sunrise || at >= sunset;
}

export function getNextAbuDhabiLightChange(at = new Date()) {
  const { sunrise, sunset } = getAbuDhabiSunTimes(at);
  if (at < sunrise) return sunrise;
  if (at < sunset) return sunset;
  return getAbuDhabiSunTimes(new Date(at.getTime() + DAY_MS)).sunrise;
}
