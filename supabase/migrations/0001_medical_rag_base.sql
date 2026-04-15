-- Ativação da extensão pgvector para embeddings futuros no Supabase
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabela oficial de Knowledge Base RAG do Axos Hub (Clínicas Médicas)
CREATE TABLE IF NOT EXISTS public.medical_knowledge_base (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    topic VARCHAR(255) NOT NULL,
    keywords TEXT[] NOT NULL,
    context TEXT NOT NULL,
    priority_level INT DEFAULT 1, -- 1-Rotina, 2-Atenção, 3-Urgência
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ativa RLS
ALTER TABLE public.medical_knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso de leitura público para IA Médica"
    ON public.medical_knowledge_base FOR SELECT
    USING (true);

-- Injeção de RAG focado em Clínicas e Consultórios Médicos
INSERT INTO public.medical_knowledge_base (topic, keywords, context, priority_level) VALUES
('Cardiologia e Preventivo', ARRAY['coração', 'pressão alta', 'hipertensão', 'palpitação', 'dor no peito', 'falta de ar', 'holter', 'ecocardiograma', 'eletro', 'infarto'], 'Risco Cardiológico. Qualquer menção a dor no peito irradia requer triagem presencial ou PS imediato (Prioridade 3). Exames de esteira e ecocardiograma devem ser remarcados para check-up premium do paciente hipertenso.', 3),
('Ginecologia e Obstetrícia', ARRAY['gestante', 'grávida', 'prenatal', 'preventivo', 'papanicolau', 'cólica forte', 'sangramento', 'menopausa', 'cisto', 'mioma', 'ultrassom transvaginal', 'diu'], 'Atendimento humanizado. Focar em empoderamento e privacidade. Agendamentos de preventivo devem ser anuais. Sangramento fora de ciclo ou cólicas severas exigem antecipação de ultrassom.', 2),
('Dermatologia e Estética Corporal', ARRAY['espinha', 'acne', 'mancha no rosto', 'melasma', 'queda de cabelo', 'alopecia', 'botox preventivo', 'laser', 'peeling', 'verruga', 'pinta crescendo'], 'Ticket Alto e Reincidência. Focar em cronogramas faciais contínuos. Para pintas assimétricas que mudam de cor, indicar dermatoscopia imediata para descartar melanoma.', 1),
('Pediatria', ARRAY['filho', 'bebê', 'vacina', 'febre', 'tosse', 'catarro', 'criança não come', 'pediatra', 'alergia leite', 'manchas no corpo filho'], 'Urgência parental. Pais ansiosos requerem resolutividade. Febre alta resistente a antitérmico é prioridade extrema e pronto-socorro.', 3),
('Ortopedia e Fisioterapia', ARRAY['dor nas costas', 'lombar', 'ciático', 'ombro travado', 'joelho doendo', 'torção', 'fratura', 'gesso', 'fisioterapia', 'rpg', 'pilates'], 'Pacientes com dor mecânica. Oferecer combos de diagnóstico (Raio-X/Ressonância) + Reabilitação (Pacotes de Fisio/RPG). O fechamento de pacote inteiro aumenta lucratividade.', 2),
('Gastroenterologia', ARRAY['estômago', 'azia', 'refluxo', 'gastrite', 'úlcera', 'dor de barriga', 'endoscopia', 'colonoscopia', 'diarreia crônica'], 'Procedimentos com preparo. A IA precisa reforçar instruções de jejum e preparo intestinal automáticos via mensagem. Abordar risco de H. Pylori e rastreio de pólipos.', 2),
('Oftalmologia', ARRAY['vista embaçada', 'grau', 'óculos', 'lente', 'catarata', 'glaucoma', 'olho vermelho', 'ardência olho'], 'Exames práticos e rotina anual. Catarata em idosos é cirurgia premium, deve ser vendida com foco em independência de vida e lentes intraoculares multifocais.', 1),
('Endocrinologia e Emagrecimento', ARRAY['dieta', 'obesidade', 'diabetes', 'tireoide', 'hormônio', 'testosterona', 'chip beleza', 'emagrecimento', 'glicose', 'insulina', 'ozempic'], 'Especialidade de tickets recorrentes, chips hormonais e acompanhamento 360. Vender consulta como "Transformação Corporal e Longevidade". Controle de diabetes exige chamadas ativas contínuas.', 2),
('Neurologia', ARRAY['enxaqueca', 'dor de cabeça forte', 'tontura', 'vertigem', 'tremores', 'memória', 'alzheimer', 'labirintite', 'avc'], 'Sintomas debilitantes. Para enxaqueca crônica, oferecer aplicação de botox terapêutico ou bloqueios. Desvios graves na face, fala enrolada, demandam SAME/PS Urgência 1.', 3),
('Exames de Imagem e Laboratório', ARRAY['sangue', 'fezes', 'urina', 'ressonância', 'tomografia', 'ultrassom', 'raio x', 'checkup', 'laboratório'], 'Setor de volume. O paciente não quer sair da clínica para fazer exame. A IA deve agregar o exame de sangue à consulta, avisando que "realizamos coleta aqui no local". Oferecer "Check-up Executivo VIP" para atrair C-Levels.', 1);
