export const KG_PER_LB = 0.45359237;

/** What goes into the database: kg with four decimals, so a lbs entry converts back exactly. */
export const storeKg = (kg: number) => Math.round(kg * 10000) / 10000;

/** Shows a weight as it was entered: up to two decimals, nothing rounded to plates. */
export const showWeight = (kg: number, unit: "kg" | "lbs" | string) => {
  const v = unit === "lbs" ? kg / KG_PER_LB : kg;
  return String(Math.round(v * 100) / 100);
};
