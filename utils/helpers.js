export function calcTimeDifference(date1, date2, units = 'days') {
  const ONE_DAY = 1000 * 60 * 60 * 24;
  const ONE_WEEK = ONE_DAY * 7;
  const ONE_MONTH = ONE_DAY * 30;
  const ONE_YEAR = ONE_DAY * 365;
  const differenceMs = Math.abs(date1 - date2);
  let dividingUnits;
  switch (units) {
    case 'years': {
      dividingUnits = ONE_YEAR;
      break;
    }
    case 'months': {
      dividingUnits = ONE_MONTH;
      break;
    }
    case 'weeks': {
      dividingUnits = ONE_WEEK;
      break;
    }
    default: {
      dividingUnits = ONE_DAY;
      break;
    }
  }
  return Math.round(differenceMs / dividingUnits);
}
