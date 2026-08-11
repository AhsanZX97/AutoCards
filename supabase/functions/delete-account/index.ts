import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

interface DeleteBody {
  user_id: string;
}

serve(async (req: Request) => {
  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...headers, "content-type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...headers, "content-type": "application/json" },
      });
    }

    const body: DeleteBody = await req.json();
    const { user_id } = body;
    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id in body" }), {
        status: 400,
        headers: { ...headers, "content-type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user: tokenUser }, error: tokenError } = await supabaseAnon.auth.getUser(authHeader);

    if (tokenError || !tokenUser) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...headers, "content-type": "application/json" },
      });
    }

    if (tokenUser.id !== user_id) {
      return new Response(JSON.stringify({ error: "You can only delete your own account" }), {
        status: 403,
        headers: { ...headers, "content-type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id);

    if (deleteError) {
      console.error("delete-account error:", deleteError);
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { ...headers, "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...headers, "content-type": "application/json" },
    });
  } catch (err) {
    console.error("delete-account exception:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...headers, "content-type": "application/json" },
    });
  }
});
