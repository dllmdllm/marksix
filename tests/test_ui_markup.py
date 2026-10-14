from html.parser import HTMLParser
from pathlib import Path
import collections
import hashlib
import json
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
VOID = {'meta','link','input','br','hr','img','source','wbr','area','base','col','embed','param','track'}

class Document(HTMLParser):
    def __init__(self, text):
        super().__init__(); self.nodes=[]; self.stack=[]; self.feed(text)
    def handle_starttag(self, tag, attributes):
        node={'tag':tag,'attrs':dict(attributes),'ancestors':list(self.stack)}
        self.nodes.append(node)
        if tag not in VOID:self.stack.append(node)
    def handle_startendtag(self, tag, attributes): self.handle_starttag(tag, attributes)
    def handle_endtag(self, tag):
        if self.stack and self.stack[-1]['tag']==tag:self.stack.pop()
    def by_id(self, id):return next(n for n in self.nodes if n['attrs'].get('id')==id)
    def controls(self):
        output={}
        for n in self.nodes:
            if n['tag'] not in ('input','select'):continue
            a=n['attrs']; group=next((x['attrs']['id'] for x in reversed(n['ancestors']) if 'id' in x['attrs']), '')
            key=a.get('id') or (a.get('name','')+':'+a.get('value','') if 'name' in a else group+':'+a.get('data-count',a.get('data-row','')))
            keep={k:v for k,v in a.items() if k in ('id','name','type','value','checked','min','max','data-count','data-row')}
            if n['tag']=='select':keep['options']=[x['attrs'] for x in self.nodes if x['tag']=='option' and n in x['ancestors']]
            if key in output:raise AssertionError('Duplicate control '+key)
            output[key]=keep
        return output

class MarkupTests(unittest.TestCase):
    def setUp(self):self.doc=Document((ROOT/'index.html').read_text())
    def test_original_controls_defaults_and_logic_are_preserved(self):
        expected=json.loads((ROOT/'tests/ui-contract.json').read_text())
        self.assertEqual(self.doc.controls(),expected['controls'])
        self.assertTrue(set(expected['ids']).issubset({n['attrs'].get('id') for n in self.doc.nodes}))
        b=(ROOT/'app.js').read_bytes();self.assertEqual(hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest(),expected['appBlob'])
    def test_tabs_labels_targets_and_default_visibility(self):
        ids=[n['attrs']['id'] for n in self.doc.nodes if 'id' in n['attrs']]
        self.assertEqual(len(ids),len(set(ids)))
        for name in ('choose','filters','results','history'):
            tab=self.doc.by_id(name+'Tab');panel=self.doc.by_id(name+'View')
            self.assertEqual(tab['attrs']['role'],'tab');self.assertEqual(tab['attrs']['aria-controls'],panel['attrs']['id'])
            self.assertEqual(panel['attrs']['aria-labelledby'],tab['attrs']['id']);self.assertEqual(panel['attrs']['role'],'tabpanel')
            self.assertEqual('hidden' in panel['attrs'],name!='choose')
    def test_inputs_live_in_the_intended_retained_views(self):
        for id,view in [('lastN','chooseView'),('numberBoard','chooseView'),('redCount','filtersView'),('sumMin','filtersView'),('generateBtn','resultsView'),('resultList','resultsView'),('analysisN','historyView'),('repeatInfo','historyView'),('syncAll','historyView')]:
            self.assertIn(view,[p['attrs'].get('id') for p in self.doc.by_id(id)['ancestors']])
        self.assertFalse(any(n['attrs'].get('role')=='tabpanel' for n in self.doc.by_id('analysisMeta')['ancestors']))
    def test_progressive_disclosure_and_input_names(self):
        advanced=self.doc.by_id('advancedFilters');self.assertEqual(advanced['tag'],'details');self.assertNotIn('open',advanced['attrs'])
        for id in ('redCount','metalCount','rowLimit','maxTail','maxConsecutive'):
            self.assertIn(advanced,self.doc.by_id(id)['ancestors'])
        for n in self.doc.nodes:
            if n['tag']=='input' and ('data-count' in n['attrs'] or 'data-row' in n['attrs'] or n['attrs'].get('type')=='range'):
                self.assertIn('aria-label',n['attrs'])
        references=[n for n in self.doc.nodes if n['attrs'].get('class')=='category-reference']
        self.assertGreaterEqual(len(references),12);self.assertTrue(all(n['tag']=='details' and 'open' not in n['attrs'] for n in references))
        self.assertTrue(any(n['tag']=='label' and n['attrs'].get('for')=='ticketCount' for n in self.doc.nodes))
    def test_mobile_padding_and_reduced_motion_contract(self):
        css=(ROOT/'styles.css').read_text()
        self.assertIn('var(--mobile-action-height, 160px)',css)
        self.assertIn('env(safe-area-inset-bottom)',css)
        self.assertIn('@media (prefers-reduced-motion: reduce)',css)
        self.assertRegex(css,r'\[hidden\]\s*\{\s*display:\s*none\s*!important')
    def test_repeat_headers_survive_original_empty_state_cell_updates(self):
        repeat=self.doc.by_id('repeatInfo')
        headers=[n for n in self.doc.nodes if repeat in n['ancestors'] and n['attrs'].get('role')=='columnheader']
        self.assertEqual(len(headers),6)
        self.assertTrue(all('repeat-cell' not in n['attrs'].get('class','').split() for n in headers))

if __name__=='__main__':unittest.main()
