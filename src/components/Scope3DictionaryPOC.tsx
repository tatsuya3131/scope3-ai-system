import React, { useState, useCallback, useEffect } from 'react';
import { Upload, Download, Brain, Database, Search, Plus, Trash2, Edit3, CheckCircle, AlertTriangle, BarChart3, FileText, Zap } from 'lucide-react';

// データ構造
interface DictionaryEntry {
  id: string;
  keywords: string[];
  category: string;
  categoryCode: string;
  confidence: number;
  source: 'manual' | 'learned';
  frequency: number;
  minAmount?: number;
  maxAmount?: number;
  supplierHints?: string[];
}

interface LearningData {
  itemName: string;
  supplierName: string;
  amount: number;
  category: string;           // カテゴリに変更
  categoryCode: string;
}

interface MatchResult {
  itemName: string;
  supplierName: string;
  amount: number;
  matchedEntry: DictionaryEntry | null;
  confidence: number;
  predictedCategory: string;   // 予測カテゴリに変更
}

const Scope3DictionaryPOC = () => {
  // SheetJSインポート
  const XLSX = typeof window !== 'undefined' && (window as any).XLSX;
  const [activeTab, setActiveTab] = useState<'learn' | 'dictionary' | 'test'>('learn');
  const [dictionary, setDictionary] = useState<DictionaryEntry[]>([]);
  const [learningFile, setLearningFile] = useState<File | null>(null);
  const [testFile, setTestFile] = useState<File | null>(null);
  const [isLearning, setIsLearning] = useState(false);
  const [learningProgress, setLearningProgress] = useState(0);
  const [testResults, setTestResults] = useState<MatchResult[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [keywordInput, setKeywordInput] = useState('');
  const [learningDataCount, setLearningDataCount] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [newEntry, setNewEntry] = useState<Partial<DictionaryEntry>>({
    keywords: [],
    category: '',
    categoryCode: '',
    source: 'manual'
  });

  // 初期辞書データ（空にする）
  useEffect(() => {
    const initialDictionary: DictionaryEntry[] = [];
    setDictionary(initialDictionary);
  }, []);

  // 正規化関数
  const normalizeText = (text: string): string => {
    if (!text) return '';
    return text
      .replace(/\s+/g, '')
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
      .toLowerCase();
  };

  // 辞書マッチング（改良版：金額とサプライヤー考慮）
  const matchWithDictionary = (itemName: string, supplierName: string, amount?: number): { entry: DictionaryEntry; confidence: number } | null => {
    const normalizedItem = normalizeText(itemName);
    const normalizedSupplier = normalizeText(supplierName);
    const combinedText = normalizedItem + normalizedSupplier;

    let bestMatch: { entry: DictionaryEntry; confidence: number } | null = null;

    for (const entry of dictionary) {
      let matchScore = 0;
      let matchCount = 0;

      // キーワードマッチング
      for (const keyword of entry.keywords) {
        const normalizedKeyword = normalizeText(keyword);
        if (combinedText.includes(normalizedKeyword)) {
          matchScore += keyword.length / normalizedKeyword.length;
          matchCount++;
        }
      }

      if (matchCount > 0) {
        let confidence = Math.min(0.95, (matchScore / entry.keywords.length) * entry.confidence);
        
        // 金額マッチングボーナス
        if (amount && entry.minAmount && entry.maxAmount) {
          if (amount >= entry.minAmount && amount <= entry.maxAmount) {
            confidence += 0.1; // 金額範囲内なら信頼度+10%
          } else if (amount < entry.minAmount * 0.5 || amount > entry.maxAmount * 2) {
            confidence -= 0.2; // 金額が大きくずれていたら信頼度-20%
          }
        }
        
        // サプライヤーマッチングボーナス
        if (entry.supplierHints && entry.supplierHints.length > 0) {
          for (const hint of entry.supplierHints) {
            if (normalizedSupplier.includes(normalizeText(hint))) {
              confidence += 0.15; // サプライヤーヒントがマッチしたら+15%
              break;
            }
          }
        }
        
        confidence = Math.min(0.98, confidence); // 最大98%に制限
        
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { entry, confidence };
        }
      }
    }

    return bestMatch;
  };

  // 学習データから辞書生成（エラー修正版）
  const learnFromData = async () => {
    if (!learningFile) {
      alert('学習ファイルを選択してください');
      return;
    }

    setIsLearning(true);
    setLearningProgress(0);
    setCurrentStep('学習開始...');

    try {
      console.log('学習開始:', learningFile.name);
      
      // ファイル読み込み
      const fileData = await learningFile.arrayBuffer();
      
      setLearningProgress(5);
      setCurrentStep('ライブラリ読み込み中...');
      
      // SheetJSがない場合はCDNから読み込み
      if (!window.XLSX) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        document.head.appendChild(script);
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
        });
      }
      
      setLearningProgress(10);
      setCurrentStep('Excelファイル解析中...');
      
      const workbook = window.XLSX.read(fileData);
      console.log('ワークブック読み込み完了:', workbook.SheetNames);
      
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData = window.XLSX.utils.sheet_to_json(sheet, { header: 1 });
      
      setLearningProgress(15);
      setCurrentStep(`データ検証中... (${rawData.length}行)`);

      // ヘッダーを除外してデータを取得
      const learningData = rawData.slice(1).filter(row => row && row.length >= 3);
      console.log(`有効な学習データ: ${learningData.length}件`);
      
      // 学習データ件数を更新
      setLearningDataCount(learningData.length);

      if (learningData.length === 0) {
        throw new Error('有効な学習データが見つかりません。Excel形式を確認してください。');
      }

      setLearningProgress(25);
      setCurrentStep('カテゴリ別グループ化中...');

      // カテゴリ別にデータをグループ化
      const categoryGroups: { [key: string]: any[] } = {};
      let validRowCount = 0;
      
      learningData.forEach((row, index) => {
        try {
          const itemName = row[0]?.toString() || '';
          const supplier = row[1]?.toString() || '';
          const amount = row[2] ? parseFloat(row[2].toString()) : 0;
          const emissionUnit = row[3]?.toString() || '';
          
          if (itemName && supplier && emissionUnit && emissionUnit.includes('環境省DB')) {
            if (!categoryGroups[emissionUnit]) {
              categoryGroups[emissionUnit] = [];
            }
            categoryGroups[emissionUnit].push({ itemName, supplier, amount, index });
            validRowCount++;
          }
        } catch (error) {
          console.warn(`行${index + 2}でエラー:`, error);
        }
      });

      const categoryCount = Object.keys(categoryGroups).length;
      console.log(`有効データ: ${validRowCount}件, カテゴリ数: ${categoryCount}`);

      if (categoryCount === 0) {
        throw new Error('排出原単位が設定されたデータが見つかりません。');
      }

      setLearningProgress(50);
      setCurrentStep(`キーワード抽出中... (${categoryCount}カテゴリ)`);

      // 各カテゴリからキーワードパターンを抽出
      const newEntries: DictionaryEntry[] = [];
      let entryId = Date.now();
      let processedCategories = 0;

      for (const [emissionUnit, items] of Object.entries(categoryGroups)) {
        if (items.length < 2) continue; // 2件未満は除外

        try {
          // キーワード抽出
          const allKeywords: string[] = [];
          const suppliers: string[] = [];
          const amounts: number[] = [];

          items.forEach(item => {
            // 品目名からキーワード抽出
            const itemKeywords = extractKeywords(item.itemName);
            allKeywords.push(...itemKeywords);
            
            // 仕入先名を正規化
            const normalizedSupplier = normalizeSupplier(item.supplier);
            if (normalizedSupplier) suppliers.push(normalizedSupplier);
            
            // 金額
            if (item.amount > 0) amounts.push(item.amount);
          });

          // 頻出キーワードを抽出
          const keywordFreq: { [key: string]: number } = {};
          allKeywords.forEach(keyword => {
            if (keyword && keyword.length >= 2) {
              keywordFreq[keyword] = (keywordFreq[keyword] || 0) + 1;
            }
          });

          // 頻度の高いキーワードを選択
          const significantKeywords = Object.entries(keywordFreq)
            .filter(([keyword, freq]) => freq >= Math.max(1, Math.floor(items.length * 0.05)))
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([keyword]) => keyword);

          if (significantKeywords.length > 0) {
            // カテゴリ名とコード抽出
            const categoryMatch = emissionUnit.match(/(\d{6})\s+(.+?)(?:\s*$)/);
            const categoryCode = categoryMatch ? categoryMatch[1] : '';
            const categoryName = categoryMatch ? categoryMatch[2].trim() : emissionUnit.replace('環境省DB 5産連表', '').trim();

            // 金額レンジ計算
            amounts.sort((a, b) => a - b);
            const minAmount = amounts.length > 0 ? amounts[0] : undefined;
            const maxAmount = amounts.length > 0 ? amounts[amounts.length - 1] : undefined;

            newEntries.push({
              id: (entryId++).toString(),
              keywords: significantKeywords,
              category: categoryName,
              categoryCode,
              confidence: Math.min(0.92, Math.max(0.65, Math.log10(items.length + 1) / 2.5)),
              source: 'learned',
              frequency: items.length,
              minAmount,
              maxAmount,
              supplierHints: [...new Set(suppliers)].slice(0, 4)
            });
          }
          
          processedCategories++;
          if (processedCategories % 5 === 0) {
            setLearningProgress(50 + (processedCategories / categoryCount) * 35);
            setCurrentStep(`辞書生成中... (${processedCategories}/${categoryCount})`);
            await new Promise(resolve => setTimeout(resolve, 10)); // UI更新のため少し待機
          }
        } catch (error) {
          console.warn(`カテゴリ ${emissionUnit} の処理でエラー:`, error);
        }
      }

      setLearningProgress(90);
      setCurrentStep('辞書統合中...');

      // 既存辞書と統合
      setDictionary(prev => [...prev, ...newEntries]);
      
      setLearningProgress(100);
      setCurrentStep(`✅ 学習完了: ${newEntries.length}個の辞書エントリを生成しました`);
      
      console.log(`学習完了: ${newEntries.length}個のエントリを生成`);
      console.log('生成されたエントリ例:', newEntries.slice(0, 3));
      
    } catch (error) {
      console.error('Learning error:', error);
      setCurrentStep(`❌ エラー: ${error.message}`);
      alert(`学習エラー: ${error.message}`);
    } finally {
      setIsLearning(false);
    }
  };

  // キーワード抽出関数（改良版）
  const extractKeywords = (text: string): string[] => {
    if (!text) return [];
    
    // 正規化
    const normalized = text
      .toString()
      .replace(/\s+/g, '') // スペース除去
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)); // 全角→半角
    
    // 意味のある単語を抽出
    const keywords: string[] = [];
    
    // 日本語単語抽出（カタカナ、ひらがな、漢字）
    const japaneseWords = normalized.match(/[ァ-ヶー]{2,}|[あ-ん]{2,}|[一-龯]{1,}/g) || [];
    keywords.push(...japaneseWords.filter(word => word.length >= 2 && word.length <= 10));
    
    // 英数字単語抽出
    const alphanumericWords = normalized.match(/[a-zA-Z0-9]{2,}/g) || [];
    keywords.push(...alphanumericWords.filter(word => 
      word.length >= 2 && 
      word.length <= 15 && 
      !/^\d+$/.test(word) // 数字のみは除外
    ));
    
    return [...new Set(keywords)].slice(0, 8); // 重複除去、最大8個
  };

  // 仕入先名正規化関数（改良版）
  const normalizeSupplier = (supplier: string): string => {
    if (!supplier) return '';
    
    // 仕入先名の正規化
    let normalized = supplier
      .toString()
      .replace(/\(.*?\)/g, '') // 括弧内削除
      .replace(/（.*?）/g, '') // 全角括弧内削除
      .replace(/(株式会社|㈱|有限会社|㈲|合同会社|LLC|Inc|Corp|Ltd)/g, '') // 法人格削除
      .replace(/[引落]/g, '') // 引落等削除
      .replace(/\s+/g, '') // スペース削除
      .trim();
    
    return normalized.length >= 2 ? normalized : '';
  };

  // 手動辞書エントリ追加
  const addDictionaryEntry = () => {
    if (!newEntry.category || !newEntry.categoryCode || keywordInput.trim() === '') return;

    const keywords = keywordInput.split(/[,、]/).map(k => k.trim()).filter(k => k);
    
    const entry: DictionaryEntry = {
      id: Date.now().toString(),
      keywords,
      category: newEntry.category!,
      categoryCode: newEntry.categoryCode!,
      confidence: 0.90,
      source: 'manual',
      frequency: 1
    };

    setDictionary(prev => [...prev, entry]);
    setNewEntry({ keywords: [], category: '', categoryCode: '', source: 'manual' });
    setKeywordInput('');
  };

  // テストファイル処理（カテゴリ分類に特化）
  const testMatching = async () => {
    if (!testFile) return;

    // モックテストデータ（より多様なカテゴリテスト）
    const testData = [
      { itemName: 'システム保守委託', supplierName: '株式会社ITサポート', amount: 300000 },
      { itemName: 'AWS利用料', supplierName: 'Amazon', amount: 80000 },
      { itemName: 'ThinkPad X1 Carbon', supplierName: 'レノボ', amount: 200000 },
      { itemName: 'ネットワーク監視サービス', supplierName: 'NTTコム', amount: 120000 },
      { itemName: 'iPhone 15', supplierName: 'Apple', amount: 150000 },
      { itemName: '宅配便送料', supplierName: 'ヤマト運輸', amount: 5000 },
      { itemName: 'Oracle Database ライセンス', supplierName: 'オラクル', amount: 500000 },
      { itemName: 'サーバー修理', supplierName: 'Dell', amount: 80000 }
    ];

    const results: MatchResult[] = testData.map(item => {
      const match = matchWithDictionary(item.itemName, item.supplierName, item.amount);
      
      return {
        itemName: item.itemName,
        supplierName: item.supplierName,
        amount: item.amount,
        matchedEntry: match?.entry || null,
        confidence: match?.confidence || 0,
        predictedCategory: match?.entry.category || '未分類'
      };
    });

    setTestResults(results);
  };

  // 統計計算
  const stats = {
    totalEntries: dictionary.length,
    learnedEntries: dictionary.filter(d => d.source === 'learned').length,
    manualEntries: dictionary.filter(d => d.source === 'manual').length,
    avgConfidence: dictionary.reduce((sum, d) => sum + d.confidence, 0) / dictionary.length,
    testMatched: testResults.filter(r => r.matchedEntry).length,
    testTotal: testResults.length
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* ヘッダー */}
      <div className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Scope3 AI辞書学習システム
              </h1>
              <p className="text-gray-600 mt-1">調達データから自動辞書生成・品目分類システム</p>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <Database className="w-4 h-4" />
              <span>{stats.totalEntries}件の辞書エントリ</span>
            </div>
          </div>
        </div>
      </div>

      {/* タブナビゲーション */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              {[
                { id: 'learn', label: '学習', icon: Brain, desc: '過去データから辞書を自動生成' },
                { id: 'dictionary', label: '辞書管理', icon: Database, desc: '辞書の確認・編集・追加' },
                { id: 'test', label: 'テスト', icon: Zap, desc: '新規データでマッチング精度を確認' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <tab.icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{tab.desc}</div>
                </button>
              ))}
            </nav>
          </div>

          {/* 学習タブ */}
          {activeTab === 'learn' && (
            <div className="p-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* 学習データアップロード */}
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">学習データアップロード</h2>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
                      <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <label htmlFor="learning-file" className="cursor-pointer">
                        <span className="text-lg font-medium text-gray-900">2023下期実績データ</span>
                        <p className="text-gray-500 mt-2">
                          品目名・仕入先名・排出原単位が含まれたExcelファイル
                        </p>
                      </label>
                      <input
                        id="learning-file"
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={(e) => setLearningFile(e.target.files?.[0] || null)}
                        className="sr-only"
                      />
                      {learningFile && (
                        <p className="mt-3 text-sm text-green-600">
                          ✓ {learningFile.name}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={learnFromData}
                    disabled={!learningFile || isLearning}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-6 rounded-lg font-medium hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-400 transition-all"
                  >
                    <div className="flex items-center justify-center space-x-2">
                      <Brain className="w-5 h-5" />
                      <span>{isLearning ? '学習中...' : '辞書学習開始'}</span>
                    </div>
                  </button>

                  {isLearning && (
                    <div className="bg-blue-50 rounded-lg p-4">
                      <div className="flex justify-between text-sm text-blue-600 mb-2">
                        <span>学習進行中</span>
                        <span>{learningProgress}%</span>
                      </div>
                      <div className="w-full bg-blue-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${learningProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 学習統計 */}
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900">学習統計</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{stats.learnedEntries}</div>
                      <div className="text-sm text-blue-700">学習済み辞書</div>
                    </div>
                    <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{stats.manualEntries}</div>
                      <div className="text-sm text-green-700">手動登録辞書</div>
                    </div>
                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-lg">
                      <div className="text-2xl font-bold text-purple-600">{dictionary.length}</div>
                      <div className="text-sm text-purple-700">総カテゴリ数</div>
                    </div>
                    <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-lg">
                      <div className="text-2xl font-bold text-orange-600">{learningDataCount.toLocaleString()}</div>
                      <div className="text-sm text-orange-700">学習データ件数</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 辞書管理タブ */}
          {activeTab === 'dictionary' && (
            <div className="p-8">
              <div className="space-y-8">
                {/* 新規辞書エントリ追加 */}
                <div className="bg-gray-50 rounded-lg p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">新規辞書エントリ追加</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">キーワード（カンマ区切り）</label>
                      <input
                        type="text"
                        value={keywordInput}
                        onChange={(e) => setKeywordInput(e.target.value)}
                        placeholder="例：システム開発,委託開発,IT開発"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">カテゴリ名</label>
                      <input
                        type="text"
                        value={newEntry.category || ''}
                        onChange={(e) => setNewEntry(prev => ({ ...prev, category: e.target.value }))}
                        placeholder="例：情報サービス"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">カテゴリコード</label>
                      <div className="flex space-x-2">
                        <input
                          type="text"
                          value={newEntry.categoryCode || ''}
                          onChange={(e) => setNewEntry(prev => ({ ...prev, categoryCode: e.target.value }))}
                          placeholder="733101"
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <button
                          onClick={addDictionaryEntry}
                          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 辞書一覧 */}
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">辞書エントリ一覧</h2>
                  <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-300">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">キーワード</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">分類カテゴリ</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">コード</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">信頼度</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ソース</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {dictionary.map((entry) => (
                          <tr key={entry.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 text-sm text-gray-900">
                              <div className="flex flex-wrap gap-1">
                                {entry.keywords.slice(0, 3).map((keyword, idx) => (
                                  <span key={idx} className="inline-flex px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                                    {keyword}
                                  </span>
                                ))}
                                {entry.keywords.length > 3 && (
                                  <span className="text-xs text-gray-500">+{entry.keywords.length - 3}個</span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                              <div className="font-medium">{entry.category}</div>
                              <div className="text-xs text-gray-500">環境省DB 5産連表 {entry.categoryCode}</div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {entry.categoryCode}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                entry.confidence >= 0.9 ? 'bg-green-100 text-green-800' :
                                entry.confidence >= 0.7 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {(entry.confidence * 100).toFixed(0)}%
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                                entry.source === 'learned' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
                              }`}>
                                {entry.source === 'learned' ? '学習' : '手動'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500">
                              <button className="text-indigo-600 hover:text-indigo-900 mr-3">
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button className="text-red-600 hover:text-red-900">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* テストタブ */}
          {activeTab === 'test' && (
            <div className="p-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* テストファイルアップロード */}
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">テストデータアップロード</h2>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-green-400 transition-colors">
                      <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <label htmlFor="test-file" className="cursor-pointer">
                        <span className="text-lg font-medium text-gray-900">未分類の調達データ</span>
                        <p className="text-gray-500 mt-2">
                          品目名・仕入先名・金額が含まれたCSV/Excelファイル
                        </p>
                      </label>
                      <input
                        id="test-file"
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={(e) => setTestFile(e.target.files?.[0] || null)}
                        className="sr-only"
                      />
                      {testFile && (
                        <p className="mt-3 text-sm text-green-600">
                          ✓ {testFile.name}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={testMatching}
                    disabled={!testFile}
                    className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-3 px-6 rounded-lg font-medium hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-400 transition-all"
                  >
                    <div className="flex items-center justify-center space-x-2">
                      <Zap className="w-5 h-5" />
                      <span>マッチングテスト実行</span>
                    </div>
                  </button>
                </div>

                {/* テスト結果統計 */}
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900">テスト結果</h2>
                  {testResults.length > 0 && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">{stats.testMatched}</div>
                        <div className="text-sm text-green-700">マッチ成功</div>
                      </div>
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">
                          {stats.testTotal > 0 ? (stats.testMatched / stats.testTotal * 100).toFixed(1) : 0}%
                        </div>
                        <div className="text-sm text-blue-700">マッチング精度</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* テスト結果詳細 */}
              {testResults.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">マッチング結果詳細</h3>
                  <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-300">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">品目名</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">仕入先</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">金額</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">予測カテゴリ</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">信頼度</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ステータス</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {testResults.map((result, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                              {result.itemName}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                              {result.supplierName}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              ¥{result.amount.toLocaleString()}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {result.matchedEntry ? (
                                <div>
                                  <div className="font-medium">{result.predictedCategory}</div>
                                  <div className="text-xs text-gray-500">コード: {result.matchedEntry.categoryCode}</div>
                                </div>
                              ) : (
                                <span className="text-gray-400">未分類</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {result.matchedEntry && (
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  result.confidence >= 0.8 ? 'bg-green-100 text-green-800' :
                                  result.confidence >= 0.6 ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {(result.confidence * 100).toFixed(0)}%
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {result.matchedEntry ? (
                                <div className="flex items-center">
                                  <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                                  <span className="text-green-600">分類完了</span>
                                </div>
                              ) : (
                                <div className="flex items-center">
                                  <AlertTriangle className="w-4 h-4 text-red-500 mr-2" />
                                  <span className="text-red-600">要手動分類</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Scope3DictionaryPOC;
