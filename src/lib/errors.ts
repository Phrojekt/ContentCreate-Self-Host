import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * Erro de aplicação com status HTTP e código estável. Use em serviços/rotas
 * para sinalizar falhas esperadas (validação, não encontrado, etc.).
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode = 500, code = "INTERNAL_ERROR") {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export type ErrorBody = { error: { code: string; message: string } };

/**
 * Converte um erro em uma resposta JSON padronizada para Route Handlers.
 * Erros desconhecidos viram 500 e, em produção, não vazam detalhes internos.
 */
export function toErrorResponse(error: unknown): NextResponse<ErrorBody> {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.statusCode },
    );
  }

  // Entrada inválida (Zod) é erro do cliente, não do servidor.
  if (error instanceof ZodError) {
    const first = error.issues[0];
    const where = first?.path.length ? ` (${first.path.join(".")})` : "";
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: `Entrada inválida${where}: ${first?.message ?? "formato inesperado"}.`,
        },
      },
      { status: 400 },
    );
  }

  const isProd = process.env.NODE_ENV === "production";
  const message =
    !isProd && error instanceof Error
      ? error.message
      : "Erro interno inesperado.";

  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message } },
    { status: 500 },
  );
}
