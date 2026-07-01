import React, { useState, useRef, useCallback, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react'; // React Data Grid Component
import "ag-grid-community/styles/ag-grid.css"; // Mandatory CSS required by the Data Grid
import "ag-grid-community/styles/ag-theme-quartz.css"; // Optional Theme applied to the Data Grid
import { Title, Card, Button, Flex } from '@tremor/react';

export default function AdminDashboard() {
  const gridRef = useRef();

  // Example admin data
  const [rowData, setRowData] = useState([
    { id: '1', name: 'בי"ס תל אביב', role: 'admin', users: 1500, active: true },
    { id: '2', name: 'מחוז דרום', role: 'super-admin', users: 8000, active: true },
    { id: '3', name: 'מורה - יוסי', role: 'teacher', users: 30, active: false },
    { id: '4', name: 'בי"ס חיפה', role: 'admin', users: 450, active: true },
  ]);

  // Column Definitions: Defines the columns to be displayed.
  const [colDefs, setColDefs] = useState([
    { field: "id", headerName: "מזהה", filter: true, editable: false, width: 100 },
    { field: "name", headerName: "שם", filter: true, editable: true },
    { field: "role", headerName: "תפקיד (Role)", filter: true, editable: true },
    { field: "users", headerName: "כמות משתמשים", filter: 'agNumberColumnFilter', editable: true },
    { field: "active", headerName: "פעיל?", editable: true }
  ]);

  const defaultColDef = useMemo(() => ({
    flex: 1,
    minWidth: 150,
    filter: true,
    sortable: true,
    resizable: true,
  }), []);

  const onBtnExport = useCallback(() => {
    gridRef.current.api.exportDataAsCsv();
  }, []);

  return (
    <div className="p-6 min-h-screen bg-slate-50" dir="rtl">
      <Flex className="mb-6">
        <Title className="text-3xl font-bold text-slate-800">דשבורד מנהל (AG Grid)</Title>
        <Button onClick={onBtnExport} color="indigo" variant="secondary">
          ייצוא ל-CSV
        </Button>
      </Flex>
      
      <Card className="h-[600px] p-0 overflow-hidden border-slate-200">
        <div className="ag-theme-quartz" style={{ height: '100%', width: '100%' }}>
          <AgGridReact
            ref={gridRef}
            rowData={rowData}
            columnDefs={colDefs}
            defaultColDef={defaultColDef}
            enableRtl={true}
            pagination={true}
            paginationPageSize={20}
            rowSelection="multiple"
          />
        </div>
      </Card>
    </div>
  );
}
