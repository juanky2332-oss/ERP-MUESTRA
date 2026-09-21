
/**
 * Calculates the Unit Price based on costs and desired margin.
 * Formula: Price Unitario = ((Coste Material + Coste Mano Obra) / (1 - (Margen/100))) / Unidades
 */
export function calculateInversePrice(
  materialCost: number,
  laborCost: number,
  marginPercent: number,
  units: number
): number {
  if (units <= 0) return 0;
  if (marginPercent >= 100) return 0; // Avoid division by zero or negative price on 100% margin logic (if that were possible)

  const totalCost = materialCost + laborCost;
  const marginFactor = 1 - (marginPercent / 100);
  
  if (marginFactor <= 0) return 0; // Safety check

  const totalPrice = totalCost / marginFactor;
  const unitPrice = totalPrice / units;

  return Number(unitPrice.toFixed(2)); // Return rounded to 2 decimals
}

/**
 * Calculates the Total Price (Base Imponible)
 */
export function calculateTotal(unitPrice: number, units: number): number {
    return Number((unitPrice * units).toFixed(2));
}
