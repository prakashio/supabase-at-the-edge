import { createClient } from "@supabase/supabase-js";
import { Router } from "itty-router";
import { json, status, withContent } from "itty-router-extras";
import { readFrom, writeTo } from "./utils/cache";

const router = new Router();

router.get("/read-kv", async (request, { JOKES }) => {
  const jokes = await readFrom(JOKES, "/jokes");
  return json(jokes);
});

router.get("/write-kv", async (request, { JOKES }) => {
  const jokes = [{ title: "joke 3" }, { title: "joke 4" }];
  await writeTo(JOKES, "/jokes", jokes);

  return json(jokes);
});

router.get("/jokes", async (request, { SUPABASE_URL, ANON_KEY, JOKES }) => {
  const cacheJokes = await readFrom(JOKES, "/jokes");

  if (cacheJokes) {
    console.log("sending the cache");
    return json(cacheJokes);
  }

  console.log("fetch fresh jokes");

  const supabase = createClient(SUPABASE_URL, ANON_KEY);
  const { data } = await supabase.from("jokes").select("*");

  await writeTo(JOKES, "/jokes", data);

  return json(data);
});

router.get("/jokes/:id", async (request, { SUPABASE_URL, ANON_KEY, JOKES }) => {
  const { id } = request.params;
  const cacheJoke = await readFrom(JOKES, `/jokes/${id}`);

  if (cacheJoke) {
    console.log("sending the cache");
    return json(cacheJoke);
  }

  console.log("fetch fresh joke");

  const supabase = createClient(SUPABASE_URL, ANON_KEY);
  const { data } = await supabase
    .from("jokes")
    .select("*")
    .match({ id })
    .single();

  if (!data) {
    return status(404, "Not found!");
  }

  await writeTo(JOKES, `/jokes/${id}`, data);

  return json(data);
});

router.post(
  "/revalidate",
  withContent,
  async (request, { SUPABASE_URL, ANON_KEY, JOKES }, context) => {
    const updateCache = async () => {
      const { type, record, old_record } = request.content;
      const supabase = createClient(SUPABASE_URL, ANON_KEY);

      if (type === "INSERT" || type === "UPDATE") {
        await writeTo(JOKES, `/jokes/${record.id}`, record);
      }

      if (type === "DELETE") {
        await JOKES.delete(`/jokes/${old_record.id}`);
      }

      const { data: jokes } = await supabase.from("jokes").select("*");
      await writeTo(JOKES, "/jokes", jokes);
    };

    context.waitUntil(updateCache());

    return json({ received: true });
  }
);

router.all("*", () => status(404, "Not found!"));

export default {
  fetch: router.handle,
};
