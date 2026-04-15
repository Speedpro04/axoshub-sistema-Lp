import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Recupera o contexto médico da Knowledge Base no Supabase
 */
export const retrieveMedicalContext = async (message: string) => {
  const normalizedMessage = message.toLowerCase();
  
  const { data, error } = await supabase
    .from('medical_knowledge_base')
    .select('*');

  if (error || !data) {
    console.error("Erro RAG Médico:", error);
    return { context: "", isUrgent: false };
  }

  const matches = data.filter(entry => 
    entry.keywords.some((kw: string) => normalizedMessage.includes(kw.toLowerCase()))
  );

  if (matches.length === 0) {
    return { context: "Contexto médico geral. Seja empático e profissional.", isUrgent: false };
  }

  const isUrgent = matches.some(m => m.priority_level === 3);
  const context = matches.map(m => `[TÓPICO: ${m.topic}] ${m.context}`).join("\n");

  return { context, isUrgent };
};
