'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { 
  Brain, 
  Stethoscope, 
  Activity, 
  Plus, 
  Search, 
  FileText,
  Link as LinkIcon,
  Cpu,
  Zap
} from 'lucide-react';
import { motion } from 'framer-motion';
import styles from './second-brain.module.css';

const SimpleMDE = dynamic(() => import('react-simplemde-editor'), { ssr: false });
import "easymde/dist/easymde.min.css";

import MedicalGraph from '../../src/components/KnowledgeBase/MedicalGraph';

const MOCK_MEDICAL_NOTES = [
  { id: '1', title: 'Protocolo: Hipertensão Grave', content: '# Protocolo de Emergência Cardiologia\n\n- [ ] Verificar pressão arterial\n- [ ] Administrar [[Medicamento X]] se > 180mmHg\n- [ ] Chamar equipe de plantão', updated: 'Agora', category: 'Cardiologia' },
  { id: '2', title: 'Check-up Executivo VIP', content: '# Serviços Premium\n\nOferecer painel completo de exames de sangue + Ressonância magnética.', updated: '2h ago', category: 'Vendas' },
];

export default function MedicalSecondBrain() {
  const [activeNoteId, setActiveNoteId] = useState('1');
  const activeNote = MOCK_MEDICAL_NOTES.find(n => n.id === activeNoteId) || MOCK_MEDICAL_NOTES[0];

  return (
    <div className={styles.container}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '25px' }}>
          <Brain color="#2b6cb0" size={28} />
          <h2 style={{ fontSize: '20px', fontWeight: 900 }}>MEDICAL BRAIN</h2>
        </div>

        <div style={{ position: 'relative', marginBottom: '20px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#a0aec0' }} />
          <input 
            type="text" 
            placeholder="Pesquisar protocolos..." 
            style={{ width: '100%', padding: '10px 10px 10px 40px', borderRadius: '12px', border: '1px solid #edf2f7', outline: 'none' }}
          />
        </div>

        <div style={{ overflowY: 'auto' }}>
          {MOCK_MEDICAL_NOTES.map(note => (
            <div 
              key={note.id} 
              className={`${styles.noteItem} ${activeNoteId === note.id ? styles.activeNote : ''}`}
              onClick={() => setActiveNoteId(note.id)}
            >
              <FileText size={18} />
              <div>
                <div style={{ fontSize: '14px' }}>{note.title}</div>
                <div style={{ fontSize: '11px', opacity: 0.5 }}>{note.category}</div>
              </div>
            </div>
          ))}
        </div>

        <button style={{ marginTop: '20px', width: '100%', padding: '12px', background: '#2b6cb0', color: 'white', borderRadius: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <Plus size={18} /> NOVA NOTA
        </button>
      </aside>

      {/* Main Editor */}
      <main className={styles.editorSection}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
             <span className={`${styles.badge} ${styles.badgeMedical}`}>SOLARA MEDICAL</span>
             <span className={`${styles.badge} ${styles.badgeCelery}`}>CELERY WORKER ACTIVE</span>
          </div>
          <div style={{ fontSize: '12px', color: '#a0aec0' }}>Última edição: {activeNote.updated}</div>
        </div>
        
        <input className={styles.titleInput} value={activeNote.title} onChange={() => {}} />
        
        <SimpleMDE 
          value={activeNote.content}
          onChange={() => {}}
          options={{
            spellChecker: false,
            status: false,
            minHeight: '400px'
          }}
        />
      </main>

      {/* Side Graph & RAG Stats */}
      <aside className={styles.connectionsSection}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, color: '#2d3748', marginBottom: '15px' }}>
          <LinkIcon size={20} /> MAPA CLÍNICO
        </div>

        <MedicalGraph />

        <div style={{ marginTop: '30px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#4a5568', marginBottom: '15px' }}>ESTATÍSTICAS POLARS</h4>
          <div style={{ background: 'white', padding: '15px', borderRadius: '15px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', color: '#718096' }}>Tempo de Processamento</span>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#38a169' }}>0.012ms</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
               <span style={{ fontSize: '12px', color: '#718096' }}>Leads Analisados (Celery)</span>
               <span style={{ fontSize: '12px', fontWeight: 800 }}>1,240</span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 'auto', background: '#1a202c', color: 'white', padding: '20px', borderRadius: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <Zap color="#ecc94b" size={18} />
            <span style={{ fontSize: '14px', fontWeight: 700 }}>IA MEDICAL RAG</span>
          </div>
          <p style={{ fontSize: '12px', opacity: 0.8, lineHeight: '1.5' }}>
            Baseado no RAG do Supabase, este paciente de [[Siso]] deve ser encaminhado para [[Cirurgião Bucomaxilo]].
          </p>
          <button style={{ width: '100%', marginTop: '15px', background: '#2d3748', border: '1px solid #4a5568', color: 'white', padding: '8px', borderRadius: '8px', fontSize: '11px' }}>
            EXECUTAR PROTOCOLO
          </button>
        </div>
      </aside>
    </div>
  );
}
