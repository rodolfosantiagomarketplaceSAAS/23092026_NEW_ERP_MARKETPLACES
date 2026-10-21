import type { CostStructure, SimulationResult } from "@crm/types";

/**
 * Calculadora e Simulador de Margem Líquida Real (Unit Economics)
 * Focado na realidade operacional de Marketplaces (Mercado Livre e Shopee).
 */
export class ProfitMarginCalculator {
  /**
   * Simula a margem líquida real dado um preço de venda alvo e estrutura de custos
   */
  public static simulate(
    targetPrice: number,
    costs: CostStructure
  ): SimulationResult {
    const cmv = costs.cmv || 0;
    const custoEmbalagem = costs.custoEmbalagem || 0;
    const aliquotaImpostoPct = costs.aliquotaImpostoPct ?? 6.0;
    const comissaoMarketplacePct = costs.comissaoMarketplacePct ?? 12.0;
    
    // Taxa fixa de marketplace para pedidos de menor valor (ML: R$ 6,00 abaixo de R$ 79,00)
    let tarifaFixa = costs.tarifaFixaMarketplace ?? 0;
    if (costs.tarifaFixaMarketplace === undefined && targetPrice > 0 && targetPrice < 79.0) {
      tarifaFixa = 6.0;
    }

    const custoFrete = costs.custoFreteMedio || 0;
    const margemMinimaPct = costs.margemMinimaPct ?? 15.0;

    if (targetPrice <= 0) {
      return {
        precoSugerido: 0,
        lucroLiquidoReais: 0,
        margemLiquidaPct: 0,
        ehViavel: false,
        motivoInviabilidade: "O preço deve ser superior a R$ 0,00",
        precoPisoSugerido: 0,
        detalhamento: { valorComissao: 0, valorImposto: 0, custoTotal: 0 },
      };
    }

    // 1. Deduções proporcionais ao preço de venda (Taxas sobre faturamento)
    const valorComissao = (targetPrice * comissaoMarketplacePct) / 100;
    const valorImposto = (targetPrice * aliquotaImpostoPct) / 100;

    // 2. Custos operacionais e diretos
    const custosFixosTotais = cmv + custoEmbalagem + tarifaFixa + custoFrete;
    const custoTotal = valorComissao + valorImposto + custosFixosTotais;

    // 3. Lucro líquido e margem real
    const lucroLiquidoReais = Number((targetPrice - custoTotal).toFixed(2));
    const margemLiquidaPct = Number(((lucroLiquidoReais / targetPrice) * 100).toFixed(2));

    // 4. Preço Piso necessário para atingir exatamente a margem mínima desejada
    const divisor = 1 - (comissaoMarketplacePct + aliquotaImpostoPct + margemMinimaPct) / 100;
    let precoPisoSugerido = targetPrice;
    if (divisor > 0) {
      precoPisoSugerido = Number((custosFixosTotais / divisor).toFixed(2));
    }

    const ehViavel = margemLiquidaPct >= margemMinimaPct;

    return {
      precoSugerido: targetPrice,
      lucroLiquidoReais,
      margemLiquidaPct,
      ehViavel,
      motivoInviabilidade: ehViavel
        ? undefined
        : `Margem projetada (${margemLiquidaPct}%) abaixo da margem mínima configurada (${margemMinimaPct}%). Preço piso sugerido: R$ ${precoPisoSugerido.toFixed(2)}.`,
      precoPisoSugerido,
      detalhamento: {
        valorComissao: Number(valorComissao.toFixed(2)),
        valorImposto: Number(valorImposto.toFixed(2)),
        custoTotal: Number(custoTotal.toFixed(2)),
      },
    };
  }
}
