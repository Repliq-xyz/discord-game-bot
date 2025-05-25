import { tokens } from "../data/tokens";
import axios from "axios";
import { z } from "zod";

const coingeckoPriceResponse = z.object({
  usd_market_cap: z.number().optional(),
  usd: z.number().optional(),
  usd_24h_vol: z.number().optional(),
});
type CoingeckoPriceResponse = z.infer<typeof coingeckoPriceResponse>;

export class TokenService {
  private static async getCoingeckoPrice(network: string, address: string) {
    console.log("getCoingeckoPrice network", network);
    console.log("getCoingeckoPrice address", address);
    const options = {
      method: "GET",
      url: `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${address}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true`,
      headers: {
        accept: "application/json",
        "x-cg-demo-api-key": process.env.COINGECKO_API_KEY,
      },
    };

    const response = await axios.request(options);
    console.log("response getCoingeckoPrice", response.data[address]);
    const data = coingeckoPriceResponse.parse(response.data[address]);
    return data;
  }

  static async getTokenPrice(tokenAddress: string): Promise<number> {
    try {
      const priceData = await this.getCoingeckoPrice("solana", tokenAddress);
      if (!priceData.usd) {
        throw new Error(`No price data available for token ${tokenAddress}`);
      }
      return priceData.usd;
    } catch (error) {
      console.error(`Error fetching price for token ${tokenAddress}:`, error);
      throw error;
    }
  }

  static async getTokenPrices(): Promise<Map<string, number>> {
    const prices = new Map<string, number>();

    for (const token of tokens) {
      try {
        const price = await this.getTokenPrice(token.tokenAddress);
        prices.set(token.tokenAddress, price);
      } catch (error) {
        console.error(`Failed to get price for ${token.name}:`, error);
        // Continue with other tokens even if one fails
      }
    }

    return prices;
  }
}
