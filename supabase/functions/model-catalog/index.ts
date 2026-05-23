import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { handleModelCatalogRequest } from "../_shared/model-catalog-handler.ts";

serve(handleModelCatalogRequest);
