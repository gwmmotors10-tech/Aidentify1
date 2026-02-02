
import React, { useState, useCallback, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { supabase, uploadPartImage } from './services/supabase';
import { ScanStage, PhotoCapture, IdentificationResult, CatalogItem, AutoPart } from './types';
import { identifyParts } from './services/geminiService';
import CameraCapture from './components/CameraCapture';
import { 
  Camera, 
  Trash2, 
  Search, 
  Scan, 
  AlertCircle, 
  ChevronRight, 
  Package, 
  MapPin, 
  Percent, 
  RefreshCcw,
  CheckCircle2,
  Upload,
  FileSpreadsheet,
  Plus,
  Car,
  Database,
  Image as ImageIcon,
  X,
  Cloud,
  Save,
  History,
  Clock,
  CameraIcon,
  ImageIcon as LucideImageIcon,
  Check,
  FileDown
} from 'lucide-react';

interface HistoryItem {
  id: string;
  created_at: string;
  summary: string;
  total_matches: number;
  images: { image_url: string; angle_label: string }[];
  matches: AutoPart[];
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'SCAN' | 'CATALOG' | 'HISTORY'>('SCAN');
  const [stage, setStage] = useState<ScanStage>('IDLE');
  const [photos, setPhotos] = useState<PhotoCapture[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [results, setResults] = useState<IdentificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCatalog();
    fetchHistory();
  }, []);

  const fetchCatalog = async () => {
    const { data: catalogData } = await supabase.from('parts_catalog').select('part_number, part_name, station').order('part_number');
    if (catalogData) {
      setCatalog(catalogData.map((d: any) => ({
        partNumber: d.part_number,
        partName: d.part_name,
        station: d.station
      })));
    }
  };

  const fetchHistory = async () => {
    setIsSyncing(true);
    const { data: sessions, error: sessErr } = await supabase
      .from('recognition_sessions')
      .select(`
        *,
        captured_images(image_url, angle_label),
        recognition_matches(*)
      `)
      .order('created_at', { ascending: false })
      .limit(15);

    if (sessions && !sessErr) {
      const formattedHistory: HistoryItem[] = sessions.map((s: any) => ({
        id: s.id,
        created_at: s.created_at,
        summary: s.summary,
        total_matches: s.total_matches,
        images: s.captured_images || [],
        matches: (s.recognition_matches || []).map((m: any) => ({
          partNumber: m.part_number,
          partName: m.part_name,
          station: m.station,
          model: m.model,
          color: m.color,
          matchPercentage: m.match_percentage,
          description: m.description,
          category: m.category
        }))
      }));
      setHistory(formattedHistory);
    }
    setIsSyncing(false);
  };

  const handleCapture = useCallback((dataUrl: string) => {
    const newPhoto: PhotoCapture = {
      id: Math.random().toString(36).substr(2, 9),
      dataUrl,
      angle: `Angle ${photos.length + 1}`
    };
    setPhotos(prev => [...prev, newPhoto]);
    setShowCamera(false);
  }, [photos]);

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsSyncing(true);
    const filePromises = Array.from(files).map((file, index) => {
      return new Promise<PhotoCapture>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          resolve({
            id: Math.random().toString(36).substr(2, 9) + '-' + index,
            dataUrl: event.target?.result as string,
            angle: 'Processing...'
          });
        };
        // Fix: Explicitly cast file to Blob to solve 'unknown' type error during readAsDataURL
        reader.readAsDataURL(file as Blob);
      });
    });

    try {
      const newCaptures = await Promise.all(filePromises);
      setPhotos(prev => {
        const updated = newCaptures.map((cap, idx) => ({
          ...cap,
          angle: `Batch ${prev.length + idx + 1}`
        }));
        return [...prev, ...updated];
      });
    } catch (err) {
      setError("Error processing images from gallery.");
    } finally {
      setIsSyncing(false);
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  const removePhoto = useCallback((id: string) => {
    setPhotos(prev => prev.filter(photo => photo.id !== id));
  }, []);

  const handleCatalogUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const data = event.target?.result;
        let parsedData: any[] = [];
        
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        parsedData = XLSX.utils.sheet_to_json(worksheet);

        const formattedCatalogItems = parsedData.map((row: any) => ({
          part_number: String(row.partNumber || row['Part Number'] || row.PN || row.codigo || row['part number'] || '').trim(),
          part_name: String(row.partName || row['Part Name'] || row.Name || row.nome || row['part name'] || '').trim(),
          station: String(row.station || row.Station || row.posto || row.estacao || '').trim()
        })).filter(item => item.part_number !== '' && item.part_number !== 'undefined');

        if (formattedCatalogItems.length > 0) {
          setIsSyncing(true);
          const { error: upsertError } = await supabase
            .from('parts_catalog')
            .upsert(formattedCatalogItems, { onConflict: 'part_number' });
          
          if (upsertError) {
            console.error("Sync error:", upsertError);
            setError("Failed to sync inventory. Ensure columns are: Part Number, Part Name, Station");
          } else {
            await fetchCatalog();
            setSuccess(`${formattedCatalogItems.length} items integrated into cloud catalog.`);
            setActiveTab('CATALOG');
            setTimeout(() => setSuccess(null), 4000);
          }
          setIsSyncing(false);
        }
      } catch (err) {
        setError("Error parsing file. Ensure it's a valid .xlsx or .xls");
      }
    };
    reader.readAsBinaryString(file);
  };

  const startIdentification = async () => {
    if (photos.length < 3) {
      setError("Precision requires at least 3 distinct angles.");
      return;
    }

    setStage('ANALYZING');
    setError(null);
    try {
      const data = await identifyParts(photos.map(p => p.dataUrl), catalog);
      setResults(data);

      setIsSyncing(true);
      const { data: sessionData, error: sessionErr } = await supabase
        .from('recognition_sessions')
        .insert([{ summary: data.summary, total_matches: data.parts.length }])
        .select()
        .single();

      if (sessionData && !sessionErr) {
        for (const photo of photos) {
          try {
            const publicUrl = await uploadPartImage(photo.dataUrl, `session_${sessionData.id}`);
            await supabase.from('captured_images').insert([{
              session_id: sessionData.id,
              image_url: publicUrl,
              angle_label: photo.angle
            }]);
          } catch (uploadErr) {
            console.error("Image cloud sync error:", uploadErr);
          }
        }

        if (data.parts.length > 0) {
          const matchesToInsert = data.parts.map(p => ({
            session_id: sessionData.id,
            part_number: p.partNumber,
            part_name: p.partName,
            model: p.model,
            station: p.station,
            color: p.color,
            match_percentage: p.matchPercentage,
            description: p.description,
            category: p.category
          }));
          await supabase.from('recognition_matches').insert(matchesToInsert);
        }
        await fetchHistory();
      }
      setStage('RESULT');
    } catch (err) {
      setError("AI Vision processing failed. Verify connection.");
      setStage('IDLE');
    } finally {
      setIsSyncing(false);
    }
  };

  const reset = () => {
    setPhotos([]);
    setResults(null);
    setStage('IDLE');
    setError(null);
  };

  return (
    <div className="min-h-screen pb-40 max-w-5xl mx-auto px-4 sm:px-6">
      {showCamera && <CameraCapture onCapture={handleCapture} onClose={() => setShowCamera(false)} />}
      
      <input type="file" ref={fileInputRef} onChange={handleCatalogUpload} accept=".xlsx,.xls" className="hidden" />
      <input type="file" ref={galleryInputRef} onChange={handleGalleryUpload} accept="image/*" multiple className="hidden" />

      <header className="py-8 flex flex-col md:flex-row items-center justify-between border-b border-slate-800 mb-8 sticky top-0 bg-slate-950/90 backdrop-blur-xl z-30 gap-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600 rounded-2xl shadow-xl shadow-blue-500/20">
            <Scan className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter text-white italic uppercase leading-none">
              A<span className="text-blue-500">Identify</span>
            </h1>
            <p className="text-[10px] text-slate-500 mono font-bold mt-1 uppercase tracking-widest">
              {isSyncing ? 'Syncing...' : 'Supabase v7 PRO'}
            </p>
          </div>
        </div>
        
        <nav className="flex items-center gap-1 bg-slate-900/40 p-1.5 rounded-[1.5rem] border border-slate-800/60 shadow-inner">
          <button 
            onClick={() => setActiveTab('SCAN')}
            className={`px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 text-[11px] font-black uppercase tracking-wider ${activeTab === 'SCAN' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
          >
            <CameraIcon className="w-4 h-4" />
            <span>Scan</span>
          </button>
          <button 
            onClick={() => setActiveTab('CATALOG')}
            className={`px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 text-[11px] font-black uppercase tracking-wider ${activeTab === 'CATALOG' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
          >
            <Database className="w-4 h-4" />
            <span>Catalog</span>
          </button>
          <button 
            onClick={() => setActiveTab('HISTORY')}
            className={`px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 text-[11px] font-black uppercase tracking-wider ${activeTab === 'HISTORY' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
          >
            <History className="w-4 h-4" />
            <span>History</span>
          </button>
        </nav>
      </header>

      {success && (
        <div className="mb-6 animate-in slide-in-from-top-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-xs font-black flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5" /> {success}
        </div>
      )}

      {error && (
        <div className="mb-6 animate-in slide-in-from-top-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-xs font-black flex items-center gap-3">
          <AlertCircle className="w-5 h-5" /> {error}
        </div>
      )}

      <main>
        {activeTab === 'HISTORY' && (
          <div className="space-y-6 animate-in slide-in-from-top-4 duration-500">
            <h3 className="text-2xl font-black italic flex items-center gap-3">
              <Clock className="w-6 h-6 text-amber-500" /> CLOUD SCAN SESSIONS
            </h3>
            {history.length > 0 ? (
              <div className="grid gap-5">
                {history.map((item) => (
                  <div key={item.id} className="bg-slate-900/60 border border-slate-800/60 rounded-[2rem] p-6 flex flex-col md:flex-row gap-6 shadow-2xl hover:border-amber-500/30 transition-all">
                    <div className="flex -space-x-8 shrink-0">
                      {item.images.slice(0, 3).map((img, i) => (
                        <div key={i} className="w-20 h-20 rounded-2xl overflow-hidden border-4 border-slate-900 shadow-xl">
                          <img src={img.image_url} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <p className="text-[10px] text-slate-500 font-black uppercase mb-1">{new Date(item.created_at).toLocaleString()}</p>
                      <h4 className="font-bold text-lg text-white truncate">{item.summary || 'Geometry Analysis'}</h4>
                      <p className="text-xs text-blue-400 font-black flex items-center gap-2 mt-2 uppercase tracking-tighter">
                        <CheckCircle2 className="w-4 h-4" /> {item.total_matches} Part Identification Matches
                      </p>
                    </div>
                    <div className="flex items-center">
                       <button className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 hover:text-white transition-all">
                         <ChevronRight className="w-6 h-6" />
                       </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-24 border-4 border-dashed border-slate-900 rounded-[3rem] bg-slate-900/20">
                <p className="text-slate-500 font-bold italic text-lg">Empty Cloud logs. Identify parts to begin history.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'CATALOG' && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div>
                <h3 className="text-3xl font-black italic flex items-center gap-3">
                  <Database className="w-8 h-8 text-emerald-500" /> MASTER INVENTORY
                </h3>
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2">
                  {catalog.length} Components Synced to Cloud
                </p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  disabled={isSyncing}
                  className="px-6 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] rounded-2xl transition-all shadow-xl shadow-emerald-600/20 flex items-center gap-3 uppercase tracking-widest disabled:opacity-50"
                >
                  <FileDown className="w-4 h-4" /> Excel Import
                </button>
              </div>
            </div>
            
            <div className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-8 shadow-3xl overflow-hidden backdrop-blur-md">
              <div className="grid grid-cols-3 gap-6 px-6 py-4 text-[10px] font-black uppercase text-slate-500 tracking-[0.3em] border-b border-slate-800/80 mb-6">
                <span>Part ID</span>
                <span>Part Description</span>
                <span className="text-right">Station</span>
              </div>
              
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-3 custom-scrollbar">
                {catalog.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-3 gap-6 items-center p-4 bg-slate-950/40 rounded-2xl border border-slate-800/40 group hover:border-emerald-500/40 transition-all hover:bg-slate-950/80">
                    <span className="text-emerald-400 font-black mono text-xs truncate">{item.partNumber}</span>
                    <span className="text-slate-100 text-xs font-bold truncate uppercase">{item.partName}</span>
                    <span className="text-right text-slate-500 mono text-[10px] font-black">{item.station}</span>
                  </div>
                ))}
                {catalog.length === 0 && (
                  <div className="text-center py-24 group">
                    <Database className="w-20 h-20 text-slate-800 mx-auto mb-6 group-hover:text-emerald-500/20 transition-colors" />
                    <p className="text-slate-500 font-bold italic text-lg">No Inventory Data. Integrate your XLS dataset.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'SCAN' && (
          <div className="animate-in fade-in duration-500">
            {stage === 'IDLE' && (
              <div className="space-y-8">
                <div className="bg-slate-900/40 border border-slate-800 rounded-[4rem] p-16 text-center relative overflow-hidden group shadow-3xl">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-transparent to-transparent"></div>
                  <div className="w-40 h-40 bg-blue-500/10 rounded-[3rem] flex items-center justify-center mx-auto mb-10 relative z-10 rotate-12 group-hover:rotate-0 transition-all duration-700 shadow-3xl shadow-blue-500/5">
                    <Camera className="w-20 h-20 text-blue-500" />
                  </div>
                  <h2 className="text-5xl font-black mb-6 relative z-10 tracking-tighter italic uppercase">AI Neural Recognition</h2>
                  <p className="text-slate-400 max-w-lg mx-auto mb-14 relative z-10 leading-relaxed text-xl font-medium italic">
                    Capture <span className="text-blue-400 font-black border-b-2 border-blue-500/30">3+ perspective angles</span> to identify PN and confirm matching telemetry.
                  </p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-6 relative z-10">
                    <button onClick={() => setShowCamera(true)} className="w-full sm:w-auto inline-flex items-center justify-center gap-5 px-14 py-7 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-[2rem] shadow-3xl shadow-blue-600/30 active:scale-95 transition-all text-sm uppercase tracking-[0.2em]">
                      <Camera className="w-7 h-7" /> Launch Cam
                    </button>
                    <button onClick={() => galleryInputRef.current?.click()} className="w-full sm:w-auto inline-flex items-center justify-center gap-5 px-14 py-7 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-[2rem] active:scale-95 transition-all border border-slate-700 text-sm uppercase tracking-[0.2em]">
                      <LucideImageIcon className="w-7 h-7" /> Gallery
                    </button>
                  </div>
                </div>

                {photos.length > 0 && (
                  <div className="space-y-10 animate-in fade-in duration-500 bg-slate-900/30 p-12 rounded-[3.5rem] border border-slate-800 shadow-3xl">
                    <div className="flex items-center justify-between">
                      <h3 className="font-black text-[11px] uppercase tracking-[0.4em] text-slate-500 flex items-center gap-4">
                        <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div> 
                        Telemetry Buffer ({photos.length} Frames)
                      </h3>
                      <button onClick={() => setPhotos([])} className="text-[10px] text-red-500 font-black uppercase hover:underline tracking-widest">Wipe Buffer</button>
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
                      {photos.map((photo) => (
                        <div key={photo.id} className="relative group aspect-square rounded-[2.5rem] overflow-hidden border-4 border-slate-800 bg-slate-900 shadow-3xl hover:border-blue-500 transition-all">
                          <img src={photo.dataUrl} alt={photo.angle} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                             <button onClick={() => removePhoto(photo.id)} className="p-5 bg-red-600 text-white rounded-[1.5rem] shadow-2xl hover:bg-red-500 transition-all active:scale-90">
                               <Trash2 className="w-7 h-7" />
                             </button>
                          </div>
                          <div className="absolute bottom-4 left-4 px-4 py-1.5 bg-black/60 backdrop-blur-xl rounded-xl text-[10px] font-black text-white uppercase tracking-widest border border-white/10">
                            {photo.angle}
                          </div>
                        </div>
                      ))}
                      <button onClick={() => setShowCamera(true)} className="flex flex-col items-center justify-center border-4 border-dashed border-slate-800 rounded-[2.5rem] hover:bg-slate-800/40 hover:border-slate-700 transition-all group aspect-square active:scale-95">
                        <Plus className="w-14 h-14 text-slate-800 group-hover:text-blue-500 transition-all" />
                        <span className="text-[10px] font-black text-slate-700 mt-4 uppercase tracking-widest group-hover:text-blue-400">Add Perspective</span>
                      </button>
                    </div>
                    
                    <button 
                      onClick={startIdentification} 
                      disabled={photos.length < 3 || isSyncing} 
                      className="w-full flex items-center justify-center gap-7 px-12 py-10 bg-white text-slate-950 hover:bg-slate-200 disabled:opacity-50 font-black rounded-[3rem] shadow-3xl transition-all text-2xl uppercase tracking-[0.2em] active:scale-[0.98] group"
                    >
                      {isSyncing ? <RefreshCcw className="w-10 h-10 animate-spin" /> : <Search className="w-10 h-10 group-hover:scale-125 transition-transform" />}
                      {isSyncing ? 'Accessing Neural Cloud...' : 'Analyze Component Geometry'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {stage === 'ANALYZING' && (
              <div className="flex flex-col items-center justify-center py-48 space-y-14 text-center">
                <div className="relative">
                  <div className="w-56 h-56 border-[14px] border-slate-800 border-t-blue-500 rounded-full animate-spin shadow-2xl shadow-blue-500/20"></div>
                  <Cloud className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 text-blue-500 animate-pulse" />
                </div>
                <div className="space-y-6">
                  <h3 className="text-4xl font-black italic tracking-tighter uppercase text-white">Matching Topology...</h3>
                  <p className="text-slate-500 text-xs font-black uppercase tracking-[0.4em] max-w-sm mx-auto leading-relaxed">Cross-referencing feature maps against cloud master inventory matrix</p>
                </div>
              </div>
            )}

            {stage === 'RESULT' && results && (
              <div className="space-y-12 animate-in fade-in slide-in-from-bottom-12 duration-1000">
                <div className="flex flex-col md:flex-row items-end justify-between gap-8 px-4">
                  <div>
                    <h2 className="text-6xl font-black italic tracking-tighter mb-4 uppercase text-white">Detection Report</h2>
                    <div className="flex items-center gap-4 px-6 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-[1.5rem] text-emerald-400 text-[11px] font-black uppercase tracking-[0.3em] w-fit shadow-xl">
                      <Save className="w-5 h-5" /> Persistent Cloud Telemetry Active
                    </div>
                  </div>
                  <p className="text-slate-400 text-lg font-medium italic max-w-md text-right leading-relaxed border-r-4 border-blue-500 pr-6">{results.summary}</p>
                </div>

                <div className="grid gap-10">
                  {results.parts.map((part, index) => (
                    <div key={index} className="group relative bg-slate-900 border border-slate-800/80 rounded-[3.5rem] p-12 hover:border-blue-500/40 transition-all shadow-3xl hover:bg-slate-900/90 overflow-hidden">
                      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 blur-[80px] -translate-y-1/2 translate-x-1/2 rounded-full" />
                      
                      <div className="flex flex-col lg:flex-row gap-12 relative z-10">
                        <div className="flex-1 space-y-10">
                          <div className="flex items-start justify-between">
                            <div>
                              <span className="inline-block px-5 py-2 bg-blue-500/10 text-blue-400 text-[11px] font-black uppercase rounded-2xl tracking-[0.3em] mb-5">
                                {part.category || 'Verified Automotive Logic'}
                              </span>
                              <h3 className="text-4xl font-black text-white group-hover:text-blue-400 transition-colors uppercase italic tracking-tight">{part.partName}</h3>
                            </div>
                            <div className="text-right">
                              <div className="text-6xl font-black italic text-blue-500 drop-shadow-[0_0_20px_rgba(59,130,246,0.6)]">
                                {part.matchPercentage}<span className="text-3xl">%</span>
                              </div>
                              <span className="text-[11px] text-slate-500 font-black uppercase tracking-widest mt-3 block">Neural Confidence</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                            <div className="bg-slate-950/80 p-8 rounded-[2rem] border border-slate-800/60 shadow-inner group/data">
                              <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest block mb-3 group-hover/data:text-blue-500 transition-colors">Part Number</span>
                              <p className="mono text-xl font-black text-emerald-400">{part.partNumber}</p>
                            </div>
                            <div className="bg-slate-950/80 p-8 rounded-[2rem] border border-slate-800/60 shadow-inner group/data">
                              <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest block mb-3 group-hover/data:text-blue-500 transition-colors">Station ID</span>
                              <p className="mono text-xl font-black text-white">{part.station}</p>
                            </div>
                            <div className="bg-slate-950/80 p-8 rounded-[2rem] border border-slate-800/60 shadow-inner group/data">
                              <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest block mb-3 group-hover/data:text-blue-500 transition-colors">Surface Color</span>
                              <p className="mono text-xl font-black text-amber-500">{part.color}</p>
                            </div>
                            <div className="bg-slate-950/80 p-8 rounded-[2rem] border border-slate-800/60 shadow-inner group/data">
                              <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest block mb-3 group-hover/data:text-blue-500 transition-colors">Model Variant</span>
                              <p className="mono text-xl font-black text-white truncate">{part.model}</p>
                            </div>
                          </div>
                          
                          <div className="p-8 bg-slate-950/50 rounded-[2.5rem] border border-slate-800/80 shadow-inner relative overflow-hidden">
                             <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-600/40" />
                            <p className="text-slate-400 leading-relaxed italic text-lg pr-4">"{part.description}"</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-8 sticky bottom-10 z-20">
                  <button onClick={reset} className="flex-1 px-12 py-10 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-white font-black rounded-[2.5rem] transition-all flex items-center justify-center gap-5 shadow-4xl uppercase tracking-widest text-sm active:scale-95">
                    <RefreshCcw className="w-8 h-8" /> Reset Workspace
                  </button>
                  <button onClick={() => setStage('IDLE')} className="flex-1 px-12 py-10 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-[2.5rem] transition-all flex items-center justify-center gap-5 shadow-4xl uppercase tracking-widest text-sm shadow-blue-600/30 active:scale-95">
                    <Plus className="w-8 h-8" /> Adjust Perspective
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 p-8 bg-slate-950/80 backdrop-blur-3xl border-t border-slate-900 text-center z-40">
        <div className="flex items-center justify-center gap-10 text-[11px] text-slate-600 font-black uppercase tracking-[0.5em]">
          <span className="flex items-center gap-3"><div className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div> CLOUD NOMINAL</span>
          <span className="hidden sm:inline">AIdentify v7.5-ULTRA</span>
          <span className="text-blue-500 border-b border-blue-500/30 pb-1">DATABASE SYNCED</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
