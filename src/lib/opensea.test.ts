import { describe, it, expect } from "vitest";
import { floorAUsd, mejorOfertaUsd, type OffersResp } from "@/lib/opensea";

const ETH = 2000;

describe("floorAUsd", () => {
  it("convierte floor en ETH usando el precio de ETH", () => {
    expect(floorAUsd(0.5, "ETH", ETH)).toBe(1000);
    expect(floorAUsd(0.5, "WETH", ETH)).toBe(1000);
  });
  it("trata stables como 1:1", () => {
    expect(floorAUsd(120, "USDC", ETH)).toBe(120);
  });
  it("devuelve null para símbolos que no sabemos valuar", () => {
    expect(floorAUsd(1000, "APE", ETH)).toBeNull();
  });
});

// Oferta de colección en WETH (Ethereum): 1.23 WETH por 3 NFTs → 0.41 c/u.
const WETH_ETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const offerColeccion = (montoWei: string, cantidad: string): OffersResp => ({
  offers: [
    {
      protocol_data: {
        parameters: {
          offer: [{ token: WETH_ETH, startAmount: montoWei }],
          consideration: [{ itemType: 4, token: "0xnft", startAmount: cantidad }],
        },
      },
    },
  ],
});

describe("mejorOfertaUsd", () => {
  it("calcula precio por item de una oferta de colección en WETH", () => {
    // 1.23 WETH / 3 = 0.41 WETH → 820 USD a ETH=2000.
    const usd = mejorOfertaUsd("ethereum", offerColeccion("1230000000000000000", "3"), ETH);
    expect(usd).toBeCloseTo(820, 5);
  });

  it("toma la mejor (mayor) oferta entre varias", () => {
    const data: OffersResp = {
      offers: [
        ...offerColeccion("1000000000000000000", "1").offers!, // 1 WETH = 2000
        ...offerColeccion("3000000000000000000", "1").offers!, // 3 WETH = 6000
      ],
    };
    expect(mejorOfertaUsd("ethereum", data, ETH)).toBeCloseTo(6000, 5);
  });

  it("ignora ofertas en tokens de pago que no reconoce", () => {
    const data: OffersResp = {
      offers: [
        {
          protocol_data: {
            parameters: {
              offer: [{ token: "0xdeadbeef", startAmount: "1000000000000000000" }],
              consideration: [{ itemType: 4, token: "0xnft", startAmount: "1" }],
            },
          },
        },
      ],
    };
    expect(mejorOfertaUsd("ethereum", data, ETH)).toBeNull();
  });

  it("devuelve null si no hay ofertas", () => {
    expect(mejorOfertaUsd("ethereum", { offers: [] }, ETH)).toBeNull();
  });
});
