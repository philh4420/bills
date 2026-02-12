import { NextRequest } from "next/server";

import { withOwnerAuth } from "@/lib/api/handler";
import { assertNoClosedMonths, parseLockedMonthFromError } from "@/lib/firestore/month-lock";
import { commitWorkbookImport } from "@/lib/firestore/import-commit";
import { parseBillsWorkbook } from "@/lib/import/parse-bills-workbook";
import { jsonError, jsonOk } from "@/lib/util/http";

export async function POST(request: NextRequest) {
  return withOwnerAuth(request, async ({ uid, email }) => {
    try {
      const contentType = request.headers.get("content-type") || "";
      if (!contentType.includes("multipart/form-data")) {
        return jsonError(400, "Expected multipart/form-data with file field.");
      }

      const form = await request.formData();
      const maybeFile = form.get("file");
      if (!(maybeFile instanceof File)) {
        return jsonError(400, "Missing file field.");
      }

      const commit = String(form.get("commit") ?? "false").toLowerCase() === "true";
      const bytes = await maybeFile.arrayBuffer();

      const parsed = parseBillsWorkbook({
        fileName: maybeFile.name,
        buffer: bytes
      });

      if (!commit) {
        return jsonOk({
          mode: "preview",
          fileName: maybeFile.name,
          summary: parsed.summary,
          warnings: parsed.summary.warnings
        });
      }

      try {
        await assertNoClosedMonths(uid);
      } catch (error) {
        const lockedMonth = parseLockedMonthFromError(error);
        if (lockedMonth) {
          return jsonError(423, `Month ${lockedMonth} is closed. Reopen it in reconciliation before importing.`, {
            code: "MONTH_LOCKED",
            month: lockedMonth
          });
        }
        throw error;
      }

      const committed = await commitWorkbookImport({
        uid,
        email,
        fileName: maybeFile.name,
        fileBuffer: Buffer.from(bytes),
        snapshot: parsed.snapshot,
        summary: parsed.summary
      });

      return jsonOk({
        mode: "committed",
        fileName: maybeFile.name,
        summary: parsed.summary,
        importId: committed.importId,
        sha256: committed.sha256,
        warnings: parsed.summary.warnings
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown import error";
      const details =
        process.env.NODE_ENV === "production"
          ? undefined
          : {
              message,
              hint: [
                "Confirm Firebase Admin credentials are valid.",
                "Confirm Firestore is enabled in the Firebase project.",
                "Confirm OWNER_GOOGLE_EMAIL matches the signed-in account."
              ]
            };

      return jsonError(500, "Import failed", details);
    }
  });
}
